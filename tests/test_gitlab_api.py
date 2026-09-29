from __future__ import annotations

from typing import Mapping

import pytest

from gitlabdiagram.gitlab_api import (
    GitLabApiClient,
    GitLabAuthenticationError,
    GitLabNotFoundError,
    GitLabRateLimitError,
    HttpResponse,
)
from gitlabdiagram.types import GitLabFile


def json_response(payload: object, *, status_code: int = 200, headers: Mapping[str, str] | None = None) -> HttpResponse:
    import json

    return HttpResponse(status_code=status_code, text=json.dumps(payload), headers={k.lower(): v for k, v in (headers or {}).items()})


def test_fetch_project_metadata_with_authentication_headers() -> None:
    calls: list[tuple[str, Mapping[str, str] | None]] = []

    def requester(url: str, headers: Mapping[str, str] | None = None) -> HttpResponse:
        calls.append((url, headers))
        return json_response(
            {
                "id": 123,
                "name": "example-project",
                "description": "Example project",
                "default_branch": "main",
                "visibility": "private",
                "web_url": "https://gitlab.example.com/example-org/example-project",
            }
        )

    client = GitLabApiClient("https://gitlab.example.com", "token-123", requester)
    project = client.get_project_metadata("example-org", "example-project")

    assert project.owner == "example-org"
    assert project.project == "example-project"
    assert project.default_branch == "main"
    assert project.visibility == "private"
    assert calls == [
        (
            "https://gitlab.example.com/api/v4/projects/example-org%2Fexample-project",
            {"Accept": "application/json", "PRIVATE-TOKEN": "token-123"},
        )
    ]


def test_paginate_tree_and_resolve_readme() -> None:
    def requester(url: str, headers: Mapping[str, str] | None = None) -> HttpResponse:
        from urllib.parse import parse_qs, urlparse

        parsed = urlparse(url)
        query = parse_qs(parsed.query)

        if "/repository/tree" in url and query.get("page") == ["1"]:
            return json_response(
                [
                    {"name": "src", "path": "src", "type": "tree"},
                    {"name": "README.md", "path": "README.md", "type": "blob"},
                ],
                headers={"x-next-page": "2"},
            )
        if "/repository/tree" in url and query.get("page") == ["2"]:
            return json_response([{"name": "index.py", "path": "src/index.py", "type": "blob"}])
        if "/repository/files/README.md/raw" in url:
            return HttpResponse(status_code=200, text="# Example README", headers={})
        raise AssertionError(f"Unexpected request: {url}")

    client = GitLabApiClient("https://gitlab.example.com", requester=requester)
    files = client.get_file_tree("example-org", "example-project", "main")
    readme = client.get_project_readme("example-org", "example-project", "main", files)

    assert files == [
        GitLabFile(name="src", path="src", type="tree"),
        GitLabFile(name="README.md", path="README.md", type="blob"),
        GitLabFile(name="index.py", path="src/index.py", type="blob"),
    ]
    assert readme == "# Example README"


def test_map_error_responses_to_custom_exceptions() -> None:
    unauthorized = GitLabApiClient("https://gitlab.example.com", requester=lambda *_: HttpResponse(401, "bad token", {}))
    missing = GitLabApiClient("https://gitlab.example.com", requester=lambda *_: HttpResponse(404, "missing", {}))
    rate_limited = GitLabApiClient("https://gitlab.example.com", requester=lambda *_: HttpResponse(429, "slow down", {"retry-after": "60"}))

    with pytest.raises(GitLabAuthenticationError):
        unauthorized.get_project_metadata("a", "b")
    with pytest.raises(GitLabNotFoundError):
        missing.get_project_metadata("a", "b")
    with pytest.raises(GitLabRateLimitError) as error:
        rate_limited.get_project_metadata("a", "b")
    assert error.value.retry_after_seconds == 60
