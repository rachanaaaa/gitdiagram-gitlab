from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Provider = Literal["github", "gitlab"]
FileType = Literal["blob", "tree"]


@dataclass(slots=True)
class GitLabProject:
    instance_url: str
    owner: str
    project: str
    name: str
    description: str | None
    default_branch: str
    visibility: str
    web_url: str
    id: int | None = None


@dataclass(slots=True)
class GitLabFile:
    path: str
    name: str
    type: FileType


@dataclass(slots=True)
class RepositoryData:
    provider: Provider
    project: GitLabProject
    branch: str
    files: list[GitLabFile]
    readme: str | None


@dataclass(slots=True)
class GeneratedDiagramImage:
    output_path: str
    provider: Provider
    repository: str
    image_format: Literal["svg"]
    svg: str
