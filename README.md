# gitdiagram-gitlab

A package-first Git repository diagram generator with GitLab support. Install it, run one pipeline function, and save a single diagram image to disk.

## What it does

- Fetches repository metadata, file trees, and README content from GitLab
- Supports GitLab.com, self-hosted GitLab, and GitHub-style repository URLs
- Renders a single standalone SVG diagram image
- Saves the image to disk with no frontend, no video generation, and no reel workflow

## Installation

```bash
bun install gitdiagram-gitlab
```

## Usage

```ts
import { generateDiagramImage } from 'gitdiagram-gitlab';

const result = await generateDiagramImage({
  repositoryUrl: 'https://gitlab.com/group/project',
  token: process.env.GITLAB_TOKEN,
  outputPath: './output/project-diagram.svg'
});

console.log(result.outputPath);
console.log(result.imageFormat); // svg
```

If `outputPath` is omitted, the package writes `<project>-diagram.svg` into the current working directory.

## API

### `generateDiagramImage(options)`

Runs the full package pipeline:

1. Detect repository provider
2. Fetch repository metadata and structure
3. Render one SVG diagram image
4. Save the image to disk

```ts
await generateDiagramImage({
  repositoryUrl: 'https://gitlab.example.com/team/platform/project',
  token: process.env.GITLAB_TOKEN,
  outputPath: './diagram.svg',
  maxFiles: 20,
  width: 1400
});
```

The `token` must match the detected provider.

### `renderRepositoryDiagramSvg(repositoryData, options?)`

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

- `parseGitLabUrl`
- `detectRepositoryType`
- `fetchRepositoryData`
- `GitLabApiClient`
- `GitLabAuthenticationError`
- `GitLabNotFoundError`
- `GitLabRateLimitError`

## Development

```bash
bun test
bun run build
bun run coverage
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
