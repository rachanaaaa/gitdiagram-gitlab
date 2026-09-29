from __future__ import annotations

import json
from pathlib import Path

from gitlabdiagram.diagram_pipeline import generate_diagram_image
from gitlabdiagram.gitlab_api import HttpResponse


def json_response(payload: object, *, status_code: int = 200) -> HttpResponse:
    return HttpResponse(status_code=status_code, text=json.dumps(payload), headers={"content-type": "application/json"})


def test_generate_diagram_image_writes_svg(tmp_path: Path) -> None:
    output_path = tmp_path / "diagram.svg"

    def requester(url: str, headers: dict[str, str] | None = None) -> HttpResponse:
        if url == "https://gitlab.com/api/v4/projects/group%2Fproject":
            return json_response(
                {
                    "id": 7,
                    "name": "project",
                    "description": "GitLab package pipeline",
                    "default_branch": "main",
                    "visibility": "public",
                    "web_url": "https://gitlab.com/group/project",
                }
            )
        if "/repository/tree" in url:
            return json_response([
                {"name": "README.md", "path": "README.md", "type": "blob"},
                {"name": "src", "path": "src", "type": "tree"},
            ])
        if "/repository/files/README.md/raw" in url:
            return HttpResponse(status_code=200, text="# Package pipeline", headers={})
        raise AssertionError(f"Unexpected request: {url}")

    result = generate_diagram_image(
        "https://gitlab.com/group/project",
        output_path=output_path,
        requester=requester,
    )

    saved_svg = output_path.read_text(encoding="utf-8")
    assert result.output_path == str(output_path.resolve())
    assert result.provider == "gitlab"
    assert result.repository == "group/project"
    assert result.image_format == "svg"
    assert "<svg" in saved_svg
    assert "group/project" in saved_svg
    assert "video" not in saved_svg


def test_generate_diagram_image_uses_default_output_path(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)

    def requester(url: str, headers: dict[str, str] | None = None) -> HttpResponse:
        if url == "https://gitlab.com/api/v4/projects/group%2Fproject":
            return json_response(
                {
                    "id": 8,
                    "name": "project",
                    "description": None,
                    "default_branch": "main",
                    "visibility": "private",
                    "web_url": "https://gitlab.com/group/project",
                }
            )
        if "/repository/tree" in url:
            return json_response([])
        raise AssertionError(f"Unexpected request: {url}")

    result = generate_diagram_image("https://gitlab.com/group/project", requester=requester)

    assert result.output_path == str((tmp_path / "project-diagram.svg").resolve())
    assert Path(result.output_path).read_text(encoding="utf-8").startswith("<?xml")
