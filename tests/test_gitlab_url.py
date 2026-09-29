import pytest

from gitlabdiagram.gitlab_url import ParsedGitLabUrl, parse_gitlab_url


def test_parse_full_gitlab_url() -> None:
    assert parse_gitlab_url("https://gitlab.com/example-org/example-project") == ParsedGitLabUrl(
        instance_url="https://gitlab.com",
        owner="example-org",
        project="example-project",
    )


def test_parse_gitlab_url_without_scheme() -> None:
    assert parse_gitlab_url("gitlab.com/example-org/example-project") == ParsedGitLabUrl(
        instance_url="https://gitlab.com",
        owner="example-org",
        project="example-project",
    )


def test_parse_owner_project_defaults_to_gitlab_dot_com() -> None:
    assert parse_gitlab_url("example-org/example-project") == ParsedGitLabUrl(
        instance_url="https://gitlab.com",
        owner="example-org",
        project="example-project",
    )


def test_parse_self_hosted_subgroup_and_git_suffix() -> None:
    assert parse_gitlab_url("https://gitlab.example.com/group/subgroup/project.GIT?ref=main") == ParsedGitLabUrl(
        instance_url="https://gitlab.example.com",
        owner="group/subgroup",
        project="project",
    )


def test_ignore_special_routes_after_project_path() -> None:
    assert parse_gitlab_url("https://gitlab.example.com/group/project/-/blob/main/README.md") == ParsedGitLabUrl(
        instance_url="https://gitlab.example.com",
        owner="group",
        project="project",
    )


def test_invalid_reference_raises() -> None:
    with pytest.raises(ValueError, match="Invalid GitLab project reference"):
        parse_gitlab_url("group-only")
    with pytest.raises(ValueError, match="required"):
        parse_gitlab_url("")
