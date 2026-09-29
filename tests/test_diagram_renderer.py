from dataclasses import replace

from gitlabdiagram.diagram_renderer import render_repository_diagram_svg
from gitlabdiagram.types import GitLabFile, GitLabProject, RepositoryData


REPOSITORY_DATA = RepositoryData(
    provider="gitlab",
    project=GitLabProject(
        instance_url="https://gitlab.com",
        owner="team/platform",
        project="gitlabdiagram",
        id=1,
        name="gitlabdiagram",
        description="Diagram <repo> & package",
        default_branch="main",
        visibility="public",
        web_url="https://gitlab.com/team/platform/gitlabdiagram",
    ),
    branch="main",
    files=[
        GitLabFile(path="README.md", name="README.md", type="blob"),
        GitLabFile(path="src/lib", name="lib", type="tree"),
        GitLabFile(path="src/index.py", name="index.py", type="blob"),
    ],
    readme="# Title\nDiagram generator package",
)


def test_render_standalone_svg() -> None:
    svg = render_repository_diagram_svg(REPOSITORY_DATA, max_files=2, width=800)
    assert "<svg" in svg
    assert "team/platform/gitlabdiagram" in svg
    assert "Provider: gitlab" in svg
    assert "README.md" in svg
    assert "+ 1 more files" in svg


def test_escape_xml_content() -> None:
    svg = render_repository_diagram_svg(
        RepositoryData(
            provider=REPOSITORY_DATA.provider,
            project=replace(REPOSITORY_DATA.project, description="A & B < C > D"),
            branch=REPOSITORY_DATA.branch,
            files=REPOSITORY_DATA.files,
            readme=REPOSITORY_DATA.readme,
        )
    )
    assert "A &amp; B &lt; C &gt; D" in svg
