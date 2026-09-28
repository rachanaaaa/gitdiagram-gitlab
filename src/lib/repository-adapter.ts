import { parseGitLabUrl } from './gitlab-url.js';
import { GitLabApiClient } from '../server/gitlab-api.js';
import type { RepositoryData } from '../types/gitlab.js';

interface ParsedGitHubUrl {
  owner: string;
  project: string;
}

interface GitHubRepositoryResponse {
  name: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  html_url: string;
}

interface GitHubTreeResponse {
  tree: Array<{ path: string; type: 'blob' | 'tree' }>;
}

interface GitHubBranchResponse {
  commit: {
    commit?: {
      tree?: {
        sha: string;
      };
    };
  };
}

interface GitHubReadmeResponse {
  content: string;
  encoding: string;
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;

  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }

  return value.slice(0, end);
}

function isHostLikeSegment(segment?: string): boolean {
  return Boolean(segment && (segment === 'localhost' || segment.includes('.') || segment.includes(':')));
}

function getPotentialGitLabInstanceUrl(url: string): string | null {
  const value = url.trim();

  if (value.includes('://')) {
    const parsed = new URL(value);
    return parsed.hostname === 'github.com' ? null : parsed.origin;
  }

  const [pathOnly] = value.split(/[?#]/, 1);
  const segments = pathOnly.split('/').filter(Boolean);
  const firstSegment = segments[0];

  if (!isHostLikeSegment(firstSegment) || firstSegment === 'github.com') {
    return null;
  }

  return `https://${firstSegment}`;
}

async function isGitLabInstance(instanceUrl: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(new URL('/api/v4/version', instanceUrl));
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Detects whether a repository reference should be treated as GitHub or GitLab.
 * Ambiguous owner/project references default to GitHub for compatibility.
 */
export function detectRepositoryType(url: string): 'github' | 'gitlab' {
  const value = url.trim().toLowerCase();
  const [pathOnly] = value.split(/[?#]/, 1);
  const segments = pathOnly.split('/').filter(Boolean);
  const firstSegment = segments[0];

  if (value.includes('://')) {
    const parsed = new URL(value);
    return parsed.hostname.includes('gitlab') || parsed.pathname.includes('/-/') ? 'gitlab' : 'github';
  }

  if (value.startsWith('github.com/')) {
    return 'github';
  }

  if (value.startsWith('gitlab.com/') || value.includes('/-/')) {
    return 'gitlab';
  }

  if (isHostLikeSegment(firstSegment) && firstSegment.includes('gitlab')) {
    return 'gitlab';
  }

  return 'github';
}

function parseGitHubUrl(input: string): ParsedGitHubUrl {
  const normalized = stripTrailingSlashes(input.trim());

  if (!normalized) {
    throw new Error('GitHub repository URL is required');
  }

  const raw = normalized.includes('://')
    ? normalized
    : normalized.startsWith('github.com/')
      ? `https://${normalized}`
      : `https://github.com/${normalized}`;
  const url = new URL(raw);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length < 2) {
    throw new Error(`Invalid GitHub repository reference: "${input}"`);
  }

  return {
    owner: segments[0]!,
    project: segments[1]!.replace(/\.git$/i, '')
  };
}

async function fetchGitHubRepositoryData(
  url: string,
  token?: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<RepositoryData> {
  if (!fetchImpl) {
    throw new Error('A fetch implementation is required');
  }

  const { owner, project } = parseGitHubUrl(url);
  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json'
  };

  if (token) {
    headers.Authorization = ['Bearer', token].join(' ');
  }

  const repositoryResponse = await fetchImpl(`https://api.github.com/repos/${owner}/${project}`, { headers });

  if (!repositoryResponse.ok) {
    throw new Error(`GitHub repository request failed with status ${repositoryResponse.status}`);
  }

  const repository = (await repositoryResponse.json()) as GitHubRepositoryResponse;
  const branch = repository.default_branch;
  const branchResponse = await fetchImpl(`https://api.github.com/repos/${owner}/${project}/branches/${encodeURIComponent(branch)}`, {
    headers
  });

  if (!branchResponse.ok) {
    throw new Error(`GitHub branch request failed with status ${branchResponse.status}`);
  }

  const branchPayload = (await branchResponse.json()) as GitHubBranchResponse;
  const treeSha = branchPayload.commit.commit?.tree?.sha;

  if (!treeSha) {
    throw new Error(`GitHub branch ${branch} did not include a tree SHA`);
  }

  const treeResponse = await fetchImpl(
    `https://api.github.com/repos/${owner}/${project}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
    { headers }
  );

  if (!treeResponse.ok) {
    throw new Error(`GitHub tree request failed with status ${treeResponse.status}`);
  }

  const tree = (await treeResponse.json()) as GitHubTreeResponse;
  const readmeResponse = await fetchImpl(`https://api.github.com/repos/${owner}/${project}/readme?ref=${encodeURIComponent(branch)}`, {
    headers
  });

  let readme: string | null = null;

  if (readmeResponse.ok) {
    const readmePayload = (await readmeResponse.json()) as GitHubReadmeResponse;
    readme = readmePayload.encoding === 'base64'
      ? Buffer.from(readmePayload.content, 'base64').toString('utf8')
      : readmePayload.content;
  }

  return {
    provider: 'github',
    project: {
      instanceUrl: 'https://github.com',
      owner,
      project,
      name: repository.name,
      description: repository.description,
      defaultBranch: branch,
      visibility: repository.private ? 'private' : 'public',
      webUrl: repository.html_url
    },
    branch,
    files: tree.tree
      .filter((entry) => entry.type === 'blob' || entry.type === 'tree')
      .map((entry) => ({
        path: entry.path,
        name: entry.path.split('/').pop() ?? entry.path,
        type: entry.type
      })),
    readme
  };
}

/**
 * Fetches repository data from either GitHub or GitLab and normalizes the output.
 */
export async function fetchRepositoryData(
  url: string,
  token?: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<RepositoryData> {
  const repositoryType = detectRepositoryType(url);
  const potentialGitLabInstanceUrl = getPotentialGitLabInstanceUrl(url);

  if (repositoryType === 'gitlab' || (potentialGitLabInstanceUrl && await isGitLabInstance(potentialGitLabInstanceUrl, fetchImpl))) {
    const parsed = parseGitLabUrl(url);
    const client = new GitLabApiClient(parsed.instanceUrl, token, fetchImpl);
    const metadata = await client.getProjectMetadata(parsed.owner, parsed.project);
    const branch = metadata.defaultBranch;
    const files = await client.getFileTree(parsed.owner, parsed.project, branch);
    const readme = await client.getProjectReadme(parsed.owner, parsed.project, branch, files);

    return {
      provider: 'gitlab',
      project: metadata,
      branch,
      files,
      readme
    };
  }

  if (!potentialGitLabInstanceUrl) {
    return fetchGitHubRepositoryData(url, token, fetchImpl);
  }

  throw new Error(`Unsupported repository host: ${potentialGitLabInstanceUrl}`);
}
