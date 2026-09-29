import type { GitLabFile, GitLabProject } from '../types/gitlab.js';

interface GitLabProjectResponse {
  id: number;
  name: string;
  description: string | null;
  default_branch: string | null;
  visibility: string;
  web_url: string;
}

interface GitLabTreeEntryResponse {
  name: string;
  path: string;
  type: 'blob' | 'tree';
}

export class GitLabApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'GitLabApiError';
  }
}

export class GitLabAuthenticationError extends GitLabApiError {
  constructor(message = 'GitLab authentication failed') {
    super(message, 401);
    this.name = 'GitLabAuthenticationError';
  }
}

export class GitLabNotFoundError extends GitLabApiError {
  constructor(message = 'GitLab project or resource not found') {
    super(message, 404);
    this.name = 'GitLabNotFoundError';
  }
}

export class GitLabRateLimitError extends GitLabApiError {
  constructor(public readonly retryAfterSeconds?: number, message = 'GitLab API rate limit exceeded') {
    super(message, 429);
    this.name = 'GitLabRateLimitError';
  }
}

/**
 * Small GitLab API client focused on project metadata, trees, and README access.
 */
export class GitLabApiClient {
  constructor(
    private readonly instanceUrl: string,
    private readonly token?: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {
    if (!this.fetchImpl) {
      throw new Error('A fetch implementation is required');
    }
  }

  async getProjectMetadata(owner: string, project: string): Promise<GitLabProject> {
    const response = await this.request(`/api/v4/projects/${this.encodeProjectPath(owner, project)}`);
    const payload = (await response.json()) as GitLabProjectResponse;

    return {
      instanceUrl: this.instanceUrl,
      owner,
      project,
      id: payload.id,
      name: payload.name,
      description: payload.description,
      defaultBranch: payload.default_branch ?? 'main',
      visibility: payload.visibility,
      webUrl: payload.web_url
    };
  }

  async getFileTree(owner: string, project: string, branch: string): Promise<GitLabFile[]> {
    const files: GitLabFile[] = [];
    let page = 1;

    while (true) {
      const response = await this.request(
        `/api/v4/projects/${this.encodeProjectPath(owner, project)}/repository/tree?ref=${encodeURIComponent(branch)}&recursive=true&per_page=100&page=${page}`
      );
      const payload = (await response.json()) as GitLabTreeEntryResponse[];

      files.push(
        ...payload.map((entry) => ({
          path: entry.path,
          name: entry.name,
          type: entry.type
        }))
      );

      const nextPage = response.headers.get('x-next-page');

      if (!nextPage) {
        break;
      }

      page = Number(nextPage);
    }

    return files;
  }

  async getProjectReadme(owner: string, project: string, branch: string, files?: GitLabFile[]): Promise<string | null> {
    const readme = this.findReadmePath(files ?? await this.getFileTree(owner, project, branch));

    if (!readme) {
      return null;
    }

    try {
      const response = await this.request(
        `/api/v4/projects/${this.encodeProjectPath(owner, project)}/repository/files/${encodeURIComponent(readme)}/raw?ref=${encodeURIComponent(branch)}`
      );

      return response.text();
    } catch (error) {
      if (error instanceof GitLabNotFoundError) {
        return null;
      }

      throw error;
    }
  }

  private encodeProjectPath(owner: string, project: string): string {
    return encodeURIComponent(`${owner}/${project}`);
  }

  private findReadmePath(files: GitLabFile[]): string | undefined {
    const readmeCandidates = files
      .filter((file) => file.type === 'blob' && /^readme(\.[^.]+)?$/i.test(file.name))
      .sort((left, right) => {
        const depthDifference = left.path.split('/').length - right.path.split('/').length;
        return depthDifference === 0 ? left.path.localeCompare(right.path) : depthDifference;
      });

    return readmeCandidates[0]?.path;
  }

  private async request(path: string): Promise<Response> {
    const response = await this.fetchImpl(new URL(path, this.instanceUrl), {
      headers: this.buildHeaders()
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    return response;
  }

  private buildHeaders(): HeadersInit {
    const headers: HeadersInit = {
      Accept: 'application/json'
    };

    if (this.token) {
      headers['PRIVATE-TOKEN'] = this.token;
    }

    return headers;
  }

  private async toApiError(response: Response): Promise<GitLabApiError> {
    const details = await response.text();

    if (response.status === 401) {
      return new GitLabAuthenticationError(details || 'GitLab authentication failed');
    }

    if (response.status === 404) {
      return new GitLabNotFoundError(details || 'GitLab project or resource not found');
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      return new GitLabRateLimitError(retryAfterSeconds, details || 'GitLab API rate limit exceeded');
    }

    return new GitLabApiError(details || `GitLab API request failed with status ${response.status}`, response.status, details);
  }
}
