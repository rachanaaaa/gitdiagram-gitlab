from __future__ import annotations

import base64
from urllib.parse import quote, urlparse

from gitlabdiagram.gitlab_api import GitLabApiClient, HttpRequester, default_requester
from gitlabdiagram.gitlab_url import parse_gitlab_url
from gitlabdiagram.types import GitLabFile, GitLabProject, RepositoryData


def _strip_trailing_slashes(value: str) -> str:
    return value.rstrip("/")


def _remove_git_suffix(value: str) -> str:
    return value[:-4] if value.lower().endswith(".git") else value


def _is_host_like_segment(segment: str | None) -> bool:
    return bool(segment and (segment == "localhost" or "." in segment or ":" in segment))


def _get_potential_gitlab_instance_url(url: str) -> str | None:
    value = url.strip()
    if "://" in value:
        parsed = urlparse(value)
        return None if parsed.hostname == "github.com" else f"{parsed.scheme}://{parsed.netloc}"
    path_only = value.split("?", 1)[0].split("#", 1)[0]
    segments = [segment for segment in path_only.split("/") if segment]
    if not _is_host_like_segment(segments[0] if segments else None) or segments[0] == "github.com":
        return None
    return f"https://{segments[0]}"


def _is_gitlab_instance(instance_url: str, requester: HttpRequester) -> bool:
    try:
        response = requester(f"{instance_url}/api/v4/version", None)
    except Exception:
        return False
    return response.status_code < 400


def detect_repository_type(url: str) -> str:
    value = url.strip().lower()
    path_only = value.split("?", 1)[0].split("#", 1)[0]
    segments = [segment for segment in path_only.split("/") if segment]
    first_segment = segments[0] if segments else None
    if "://" in value:
        parsed = urlparse(value)
        return "gitlab" if (parsed.hostname and "gitlab" in parsed.hostname) or "/-/" in parsed.path else "github"
    if first_segment == "github.com":
        return "github"
    if first_segment == "gitlab.com" or "/-/" in path_only:
        return "gitlab"
    if _is_host_like_segment(first_segment) and first_segment and "gitlab" in first_segment:
        return "gitlab"
    return "github"


def _parse_github_url(value: str) -> tuple[str, str, str]:
    normalized = _strip_trailing_slashes(value.strip())
    if not normalized:
        raise ValueError("GitHub repository URL is required")
    path_only = normalized.split("?", 1)[0].split("#", 1)[0]
    path_segments = [segment for segment in path_only.lower().split("/") if segment]
    raw = normalized if "://" in normalized else (f"https://{normalized}" if path_segments and path_segments[0] == "github.com" else f"https://github.com/{normalized}")
    parsed = urlparse(raw)
    segments = [segment for segment in parsed.path.split("/") if segment]
    if len(segments) < 2:
        raise ValueError(f'Invalid GitHub repository reference: "{value}"')
    is_default_host = f"{parsed.scheme}://{parsed.netloc}" == "https://github.com"
    owner_index = 0 if is_default_host or len(segments) == 2 else len(segments) - 2
    project_index = owner_index + 1
    return f"{parsed.scheme}://{parsed.netloc}", segments[owner_index], _remove_git_suffix(segments[project_index])


def _fetch_github_repository_data(url: str, token: str | None, requester: HttpRequester) -> RepositoryData:
    instance_url, owner, project = _parse_github_url(url)
    api_base_url = "https://api.github.com" if instance_url == "https://github.com" else f"{instance_url}/api/v3"
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = " ".join(["Bearer", token])

    repository_response = requester(f"{api_base_url}/repos/{owner}/{project}", headers)
    if repository_response.status_code >= 400:
        raise RuntimeError(f"GitHub repository request failed with status {repository_response.status_code}")
    repository = repository_response.json()
    assert isinstance(repository, dict)

    branch = repository.get("default_branch")
    if not branch:
        raise RuntimeError(f"GitHub repository {owner}/{project} is missing a default branch")

    branch_response = requester(f"{api_base_url}/repos/{owner}/{project}/branches/{quote(str(branch))}", headers)
    if branch_response.status_code >= 400:
        raise RuntimeError(f"GitHub branch request failed with status {branch_response.status_code}")
    branch_payload = branch_response.json()
    assert isinstance(branch_payload, dict)
    tree_sha = branch_payload.get("commit", {}).get("commit", {}).get("tree", {}).get("sha")
    if not tree_sha:
        raise RuntimeError(f"GitHub branch {branch} did not include a tree SHA")

    tree_response = requester(f"{api_base_url}/repos/{owner}/{project}/git/trees/{quote(str(tree_sha))}?recursive=1", headers)
    if tree_response.status_code >= 400:
        raise RuntimeError(f"GitHub tree request failed with status {tree_response.status_code}")
    tree_payload = tree_response.json()
    assert isinstance(tree_payload, dict)
    tree = tree_payload.get("tree", [])

    readme = None
    readme_response = requester(f"{api_base_url}/repos/{owner}/{project}/readme?ref={quote(str(branch))}", headers)
    if readme_response.status_code < 400:
        readme_payload = readme_response.json()
        assert isinstance(readme_payload, dict)
        content = str(readme_payload.get("content", ""))
        encoding = readme_payload.get("encoding")
        readme = base64.b64decode(content).decode("utf-8") if encoding == "base64" else content

    files = [
        GitLabFile(path=str(entry["path"]), name=str(entry["path"]).split("/")[-1], type=str(entry["type"]))
        for entry in tree
        if isinstance(entry, dict) and entry.get("type") in {"blob", "tree"}
    ]

    return RepositoryData(
        provider="github",
        project=GitLabProject(
            instance_url=instance_url,
            owner=owner,
            project=project,
            id=repository.get("id"),
            name=str(repository["name"]),
            description=repository.get("description"),
            default_branch=str(branch),
            visibility="private" if repository.get("private") else "public",
            web_url=str(repository["html_url"]),
        ),
        branch=str(branch),
        files=files,
        readme=readme,
    )


def _fetch_gitlab_repository_data(url: str, token: str | None, requester: HttpRequester) -> RepositoryData:
    parsed = parse_gitlab_url(url)
    client = GitLabApiClient(parsed.instance_url, token, requester)
    metadata = client.get_project_metadata(parsed.owner, parsed.project)
    files = client.get_file_tree(parsed.owner, parsed.project, metadata.default_branch)
    readme = client.get_project_readme(parsed.owner, parsed.project, metadata.default_branch, files)
    return RepositoryData(provider="gitlab", project=metadata, branch=metadata.default_branch, files=files, readme=readme)


def fetch_repository_data(
    repository_url: str,
    token: str | None = None,
    requester: HttpRequester | None = None,
) -> RepositoryData:
    http_requester = requester or default_requester
    repository_type = detect_repository_type(repository_url)
    potential_gitlab_instance_url = _get_potential_gitlab_instance_url(repository_url)

    if repository_type == "gitlab":
        return _fetch_gitlab_repository_data(repository_url, token, http_requester)
    if potential_gitlab_instance_url and _is_gitlab_instance(potential_gitlab_instance_url, http_requester):
        return _fetch_gitlab_repository_data(repository_url, token, http_requester)
    return _fetch_github_repository_data(repository_url, token, http_requester)
