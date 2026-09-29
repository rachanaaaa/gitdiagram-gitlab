# gitlabdiagram

A Python-installable repository diagram generator with GitLab support. Install it, run one pipeline function or CLI command, and save a single SVG diagram image to disk.

## What it does

- Fetches repository metadata, file trees, and README content from GitLab
- Supports GitLab.com, self-hosted GitLab, and GitHub-style repository URLs
- Renders a single standalone SVG diagram image
- Saves the image to disk with no frontend, no video generation, and no reel workflow

## Installation

For local development from this repository:

```bash
uv sync --dev
```

For editable local installation:

```bash
uv pip install -e .
```

After publishing the package to an index, consumer projects can install it with:

```bash
uv add gitlabdiagram
```

## Python usage

```python
from gitlabdiagram import generate_diagram_image

result = generate_diagram_image(
    "https://gitlab.com/group/project",
    token=None,
    output_path="./output/project-diagram.svg",
)

print(result.output_path)
print(result.image_format)  # svg
```

If `output_path` is omitted, the package writes `<project>-diagram.svg` into the current working directory.

## CLI usage

```bash
gitlabdiagram \
  --repository-url https://gitlab.com/group/project \
  --output-path ./output/project-diagram.svg
```

Use `--token` for private repositories.

## CI/CD workflow

The repository includes `/home/runner/work/gitdiagram-gitlab/gitdiagram-gitlab/.github/workflows/python-package-ci.yml`, which:

1. installs the package with `uv sync --dev`
2. runs `pytest`
3. builds the Python package with `uv build`
4. runs the CLI against the current GitHub repository
5. uploads the generated SVG as a workflow artifact

A consuming repository can use the same CLI pattern once the package is published.

## API

### `generate_diagram_image(...)`

Runs the full package pipeline:

1. detect repository provider
2. fetch repository metadata and structure
3. render one SVG diagram image
4. save the image to disk

### `render_repository_diagram_svg(repository_data, ...)`

Renders a standalone SVG string when you already have normalized repository data.

## Output

The package currently generates:

- `.svg` image output only

The package does not generate:

- videos
- reels
- frontend code
- interactive UI

## Supporting APIs

The package also exports:

- `parse_gitlab_url`
- `detect_repository_type`
- `fetch_repository_data`
- `GitLabApiClient`
- `GitLabAuthenticationError`
- `GitLabNotFoundError`
- `GitLabRateLimitError`

## Development

```bash
uv run pytest --cov=gitlabdiagram
uv build
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
