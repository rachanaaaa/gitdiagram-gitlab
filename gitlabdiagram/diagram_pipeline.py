from __future__ import annotations

from pathlib import Path

from gitlabdiagram.diagram_renderer import render_repository_diagram_svg
from gitlabdiagram.gitlab_api import HttpRequester
from gitlabdiagram.repository_adapter import fetch_repository_data
from gitlabdiagram.types import GeneratedDiagramImage


def generate_diagram_image(
    repository_url: str,
    *,
    token: str | None = None,
    output_path: str | Path | None = None,
    max_files: int = 12,
    width: int = 1200,
    requester: HttpRequester | None = None,
) -> GeneratedDiagramImage:
    repository_data = fetch_repository_data(repository_url, token, requester)
    svg = render_repository_diagram_svg(repository_data, max_files=max_files, width=width)
    resolved_output_path = Path(output_path or f"{repository_data.project.project}-diagram.svg").expanduser().resolve()
    resolved_output_path.parent.mkdir(parents=True, exist_ok=True)
    resolved_output_path.write_text(svg, encoding="utf-8")
    return GeneratedDiagramImage(
        output_path=str(resolved_output_path),
        provider=repository_data.provider,
        repository=f"{repository_data.project.owner}/{repository_data.project.project}",
        image_format="svg",
        svg=svg,
    )
