from __future__ import annotations

import json
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from gitlabdiagram.types import GitLabFile, GitLabProject


@dataclass(slots=True)
class HttpResponse:
    status_code: int
    text: str
    headers: Mapping[str, str]

    def json(self) -> object:
        return json.loads(self.text)


HttpRequester = Callable[[str, Mapping[str, str] | None], HttpResponse]


def default_requester(url: str, headers: Mapping[str, str] | None = None) -> HttpResponse:
    request = Request(url, headers=dict(headers or {}))
    try:
        with urlopen(request) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return HttpResponse(
                status_code=response.status,
                text=response.read().decode(charset),
                headers={key.lower(): value for key, value in response.headers.items()},
            )
    except HTTPError as error:
        charset = error.headers.get_content_charset() or "utf-8"
        return HttpResponse(
            status_code=error.code,
            text=error.read().decode(charset),
            headers={key.lower(): value for key, value in error.headers.items()},
        )
    except URLError as error:
        raise RuntimeError(f"Request failed for {url}: {error.reason}") from error


class GitLabApiError(RuntimeError):
    def __init__(self, message: str, status_code: int, details: str | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.details = details


class GitLabAuthenticationError(GitLabApiError):
    def __init__(self, message: str = "GitLab authentication failed") -> None:
        super().__init__(message, 401)


class GitLabNotFoundError(GitLabApiError):
    def __init__(self, message: str = "GitLab project or resource not found") -> None:
        super().__init__(message, 404)


class GitLabRateLimitError(GitLabApiError):
    def __init__(self, retry_after_seconds: int | None = None, message: str = "GitLab API rate limit exceeded") -> None:
        super().__init__(message, 429)
        self.retry_after_seconds = retry_after_seconds


class GitLabApiClient:
    def __init__(
        self,
        instance_url: str,
        token: str | None = None,
        requester: HttpRequester | None = None,
    ) -> None:
        self.instance_url = instance_url.rstrip("/")
        self.token = token
        self.requester = requester or default_requester

    def get_project_metadata(self, owner: str, project: str) -> GitLabProject:
        response = self._request(f"/api/v4/projects/{self._encode_project_path(owner, project)}")
        payload = response.json()
        assert isinstance(payload, dict)
        return GitLabProject(
            instance_url=self.instance_url,
            owner=owner,
            project=project,
            id=payload.get("id"),
            name=str(payload["name"]),
            description=payload.get("description"),
            default_branch=str(payload.get("default_branch") or "main"),
            visibility=str(payload["visibility"]),
            web_url=str(payload["web_url"]),
        )

    def get_file_tree(self, owner: str, project: str, branch: str) -> list[GitLabFile]:
        files: list[GitLabFile] = []
        page = 1
        while True:
            response = self._request(
                f"/api/v4/projects/{self._encode_project_path(owner, project)}/repository/tree?ref={quote(branch)}&recursive=true&per_page=100&page={page}"
            )
            payload = response.json()
            assert isinstance(payload, list)
            files.extend(
                GitLabFile(path=str(entry["path"]), name=str(entry["name"]), type=str(entry["type"]))
                for entry in payload
            )
            next_page = response.headers.get("x-next-page")
            if not next_page:
                break
            page = int(next_page)
        return files

    def get_project_readme(
        self,
        owner: str,
        project: str,
        branch: str,
        files: list[GitLabFile] | None = None,
    ) -> str | None:
        readme_path = self._find_readme_path(files or self.get_file_tree(owner, project, branch))
        if not readme_path:
            return None
        try:
            response = self._request(
                f"/api/v4/projects/{self._encode_project_path(owner, project)}/repository/files/{quote(readme_path, safe='')}/raw?ref={quote(branch)}"
            )
            return response.text
        except GitLabNotFoundError:
            return None

    def _encode_project_path(self, owner: str, project: str) -> str:
        return quote(f"{owner}/{project}", safe="")

    def _find_readme_path(self, files: list[GitLabFile]) -> str | None:
        readme_candidates = [
            file for file in files if file.type == "blob" and re.fullmatch(r"readme(\.[^.]+)?", file.name, flags=re.IGNORECASE)
        ]
        readme_candidates.sort(key=lambda file: (len(file.path.split("/")), file.path))
        return readme_candidates[0].path if readme_candidates else None

    def _request(self, path: str) -> HttpResponse:
        response = self.requester(f"{self.instance_url}{path}", self._build_headers())
        if response.status_code < 400:
            return response
        raise self._to_api_error(response)

    def _build_headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["PRIVATE-TOKEN"] = self.token
        return headers

    def _to_api_error(self, response: HttpResponse) -> GitLabApiError:
        details = response.text
        if response.status_code == 401:
            return GitLabAuthenticationError(details or "GitLab authentication failed")
        if response.status_code == 404:
            return GitLabNotFoundError(details or "GitLab project or resource not found")
        if response.status_code == 429:
            retry_after = response.headers.get("retry-after")
            return GitLabRateLimitError(int(retry_after) if retry_after else None, details or "GitLab API rate limit exceeded")
        return GitLabApiError(details or f"GitLab API request failed with status {response.status_code}", response.status_code, details)
