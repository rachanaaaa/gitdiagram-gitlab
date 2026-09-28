# gitdiagram-gitlab

GitLab support for GitDiagram, with a small compatibility layer that can normalize both GitLab and GitHub repositories into the same data shape.

## Features

- Parse GitLab URLs from `https://gitlab.com/group/project`, `gitlab.com/group/project`, or `group/project`
- Support self-hosted GitLab instances and subgroup paths
- Fetch project metadata, repository trees, and README content from the GitLab API
- Normalize GitLab and GitHub repository data for GitDiagram-style generation pipelines
- Test coverage for parser, API client, and adapter behavior

## Setup

```bash
bun install
```

## Scripts

```bash
bun test
bun run build
bun run coverage
```

## API

### `parseGitLabUrl(input)`

Parses a GitLab repository reference into:

```ts
{
  instanceUrl: string;
  owner: string;
  project: string;
}
```

Examples:

```ts
parseGitLabUrl('https://gitlab.com/group/project');
parseGitLabUrl('gitlab.example.com/team/platform/project');
parseGitLabUrl('group/project');
```

### `GitLabApiClient`

```ts
const client = new GitLabApiClient('https://gitlab.com', process.env.GITLAB_TOKEN);

const project = await client.getProjectMetadata('group', 'project');
const files = await client.getFileTree('group', 'project', project.defaultBranch);
const readme = await client.getProjectReadme('group', 'project', project.defaultBranch);
```

### `detectRepositoryType(url)`

Returns `'github'` or `'gitlab'`. Ambiguous `owner/project` inputs default to GitHub for compatibility with existing GitDiagram flows.

### `fetchRepositoryData(url, token?)`

Fetches normalized repository data from GitLab or GitHub:

```ts
const repository = await fetchRepositoryData('https://gitlab.com/group/project', process.env.GITLAB_TOKEN);

console.log(repository.provider); // gitlab
console.log(repository.project.defaultBranch);
console.log(repository.files.length);
```

## Data model

The library exports:

- `GitLabProject`
- `GitLabFile`
- `GitLabData`
- `RepositoryData`

`RepositoryData` is the normalized shape intended for GitDiagram-compatible generation pipelines.

## Authentication and errors

- Pass a GitLab personal access token to access private repositories
- GitLab authentication failures throw `GitLabAuthenticationError`
- Missing resources throw `GitLabNotFoundError`
- Rate-limited requests throw `GitLabRateLimitError`

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
