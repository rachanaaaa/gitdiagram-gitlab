from __future__ import annotations

import base64
import json
from collections.abc import Mapping

from gitlabdiagram.gitlab_api import HttpResponse
from gitlabdiagram.repository_adapter import detect_repository_type, fetch_repository_data
from gitlabdiagram.types import GitLabFile, GitLabProject, RepositoryData


def json_response(payload: object, *, status_code: int = 200, headers: Mapping[str, str] | None = None) -> HttpResponse:
    return HttpResponse(status_code=status_code, text=json.dumps(payload), headers={k.lower(): v for k, v in (headers or {}).items()})


def test_detect_repository_type() -> None:
    assert detect_repository_type("https://gitlab.com/group/project") == "gitlab"
    assert detect_repository_type("gitlab.example.com/group/project") == "gitlab"
    assert detect_repository_type("owner/project") == "github"
    assert detect_repository_type("https://example.com/owner/project") == "github"


def test_fetch_gitlab_data_into_normalized_shape() -> None:
    def requester(url: str, headers: Mapping[str, str] | None = None) -> HttpResponse:
        if url.endswith("/api/v4/projects/group%2Fproject"):
            return json_response(
                {
                    "id": 1,
                    "name": "project",
                    "description": "GitLab project",
                    "default_branch": "main",
                    "visibility": "public",
                    "web_url": "https://gitlab.com/group/project",
                }
            )
        if "/repository/tree" in url:
            return json_response([{"name": "README.md", "path": "README.md", "type": "blob"}])
        if "/repository/files/README.md/raw" in url:
            return HttpResponse(status_code=200, text="# GitLab README", headers={})
        raise AssertionError(f"Unexpected request: {url}")

    assert fetch_repository_data("https://gitlab.com/group/project", requester=requester) == RepositoryData(
        provider="gitlab",
        project=GitLabProject(
            instance_url="https://gitlab.com",
            owner="group",
            project="project",
            id=1,
            name="project",
            description="GitLab project",
            default_branch="main",
            visibility="public",
            web_url="https://gitlab.com/group/project",
        ),
        branch="main",
        files=[GitLabFile(name="README.md", path="README.md", type="blob")],
        readme="# GitLab README",
    )


def test_fetch_github_data_into_normalized_shape() -> None:
    def requester(url: str, headers: Mapping[str, str] | None = None) -> HttpResponse:
        if url == "https://api.github.com/repos/owner/project":
            return json_response(
                {
                    "id": 101,
                    "name": "project",
                    "description": "GitHub project",
                    "default_branch": "main",
                    "private": False,
                    "html_url": "https://github.com/owner/project",
                }
            )
        if url == "https://api.github.com/repos/owner/project/branches/main":
            return json_response({"commit": {"commit": {"tree": {"sha": "tree-sha-123"}}}})
        if url == "https://api.github.com/repos/owner/project/git/trees/tree-sha-123?recursive=1":
            return json_response({"tree": [{"path": "README.md", "type": "blob"}]})
        if url == "https://api.github.com/repos/owner/project/readme?ref=main":
            return json_response({"content": base64.b64encode(b"# GitHub README").decode("utf-8"), "encoding": "base64"})
        raise AssertionError(f"Unexpected request: {url}")

    assert fetch_repository_data("owner/project", requester=requester) == RepositoryData(
        provider="github",
        project=GitLabProject(
            instance_url="https://github.com",
            owner="owner",
            project="project",
            id=101,
            name="project",
            description="GitHub project",
            default_branch="main",
            visibility="public",
            web_url="https://github.com/owner/project",
        ),
        branch="main",
        files=[GitLabFile(name="README.md", path="README.md", type="blob")],
        readme="# GitHub README",
    )


def test_self_hosted_gitlab_detection_by_probe() -> None:
    calls: list[str] = []

    def requester(url: str, headers: Mapping[str, str] | None = None) -> HttpResponse:
        calls.append(url)
        if url == "https://example.com/api/v4/version":
            return json_response({"version": "17.0.0"})
        if url == "https://example.com/api/v4/projects/group%2Fproject":
            return json_response(
                {
                    "id": 2,
                    "name": "project",
                    "description": None,
                    "default_branch": "main",
                    "visibility": "private",
                    "web_url": "https://example.com/group/project",
                }
            )
        if "/repository/tree" in url:
            return json_response([{"name": "README.md", "path": "README.md", "type": "blob"}])
        if "/repository/files/README.md/raw" in url:
            return HttpResponse(status_code=200, text="# Self-hosted README", headers={})
        raise AssertionError(f"Unexpected request: {url}")

    result = fetch_repository_data("https://example.com/group/project", requester=requester)

    assert result.provider == "gitlab"
    assert result.project.id == 2
    assert calls[:2] == [
        "https://example.com/api/v4/version",
        "https://example.com/api/v4/projects/group%2Fproject",
    ]


def test_github_fallback_for_non_gitlab_absolute_host() -> None:
    def requester(url: str, headers: Mapping[str, str] | None = None) -> HttpResponse:
        if url == "https://example.com/api/v4/version":
            return HttpResponse(status_code=404, text="not gitlab", headers={})
        if url == "https://example.com/api/v3/repos/owner/project":
            return json_response(
                {
                    "id": 303,
                    "name": "project",
                    "description": "Enterprise GitHub project",
                    "default_branch": "main",
                    "private": False,
                    "html_url": "https://example.com/owner/project",
                }
            )
        if url == "https://example.com/api/v3/repos/owner/project/branches/main":
            return json_response({"commit": {"commit": {"tree": {"sha": "tree-sha-enterprise"}}}})
        if url == "https://example.com/api/v3/repos/owner/project/git/trees/tree-sha-enterprise?recursive=1":
            return json_response({"tree": [{"path": "README.md", "type": "blob"}]})
        if url == "https://example.com/api/v3/repos/owner/project/readme?ref=main":
            return json_response({"content": base64.b64encode(b"# Enterprise README").decode("utf-8"), "encoding": "base64"})
        raise AssertionError(f"Unexpected request: {url}")

    result = fetch_repository_data("https://example.com/scm/owner/project", requester=requester)

    assert result.project.instance_url == "https://example.com"
    assert result.project.id == 303
    assert result.readme == "# Enterprise README"
