from pathlib import Path

from gitlabdiagram import cli
from gitlabdiagram.types import GeneratedDiagramImage


def test_cli_invokes_pipeline(monkeypatch, capsys, tmp_path: Path) -> None:
    output_path = tmp_path / "diagram.svg"

    def fake_generate_diagram_image(**kwargs):
        assert kwargs["repository_url"] == "https://gitlab.com/group/project"
        return GeneratedDiagramImage(
            output_path=str(output_path),
            provider="gitlab",
            repository="group/project",
            image_format="svg",
            svg="<svg />",
        )

    monkeypatch.setattr(cli, "generate_diagram_image", fake_generate_diagram_image)

    exit_code = cli.main(["--repository-url", "https://gitlab.com/group/project", "--output-path", str(output_path)])

    assert exit_code == 0
    assert capsys.readouterr().out.strip() == str(output_path)
