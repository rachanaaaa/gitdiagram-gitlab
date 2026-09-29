from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

DEFAULT_GITLAB_INSTANCE = "https://gitlab.com"


@dataclass(slots=True)
class ParsedGitLabUrl:
    instance_url: str
    owner: str
    project: str


def _strip_trailing_slashes(value: str) -> str:
    return value.rstrip("/")


def _remove_git_suffix(value: str) -> str:
    return value[:-4] if value.lower().endswith(".git") else value


def _is_host_like(segment: str) -> bool:
    return segment == "localhost" or "." in segment or ":" in segment


def _extract_project_segments(pathname: str) -> list[str]:
    segments = [segment for segment in pathname.split("/") if segment]
    project_segments = segments[: segments.index("-")] if "-" in segments else segments
    if len(project_segments) < 2:
        raise ValueError(f'Invalid GitLab project path: "{pathname}"')
    return project_segments


def _build_parsed_url(instance_url: str, segments: list[str]) -> ParsedGitLabUrl:
    project = _remove_git_suffix(segments[-1])
    owner = "/".join(segments[:-1])
    if not project:
        raise ValueError("GitLab project name is missing")
    if not owner:
        raise ValueError("GitLab owner or namespace is missing")
    return ParsedGitLabUrl(instance_url=_strip_trailing_slashes(instance_url), owner=owner, project=project)


def parse_gitlab_url(value: str) -> ParsedGitLabUrl:
    normalized = _strip_trailing_slashes(value.strip())
    if not normalized:
        raise ValueError("GitLab project URL is required")

    if "://" in normalized:
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError(f"Unsupported GitLab URL protocol: {parsed.scheme}")
        return _build_parsed_url(f"{parsed.scheme}://{parsed.netloc}", _extract_project_segments(parsed.path))

    path_only = normalized.split("?", 1)[0].split("#", 1)[0]
    segments = [segment for segment in path_only.split("/") if segment]
    if len(segments) < 2:
        raise ValueError(f'Invalid GitLab project reference: "{value}"')

    if _is_host_like(segments[0]):
        return _build_parsed_url(f"https://{segments[0]}", _extract_project_segments("/" + "/".join(segments[1:])))

    return _build_parsed_url(DEFAULT_GITLAB_INSTANCE, _extract_project_segments("/" + "/".join(segments)))
