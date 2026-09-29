import { describe, expect, it, vi } from 'vitest';

import {
  GitLabApiClient,
  GitLabAuthenticationError,
  GitLabNotFoundError,
  GitLabRateLimitError
} from './gitlab-api.js';

function createJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    },
    ...init
  });
}

describe('GitLabApiClient', () => {
  it('fetches project metadata with authentication headers', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        id: 123,
        name: 'example-project',
        description: 'Example project',
        default_branch: 'main',
        visibility: 'private',
        web_url: 'https://gitlab.example.com/example-org/example-project'
      })
    );

    const client = new GitLabApiClient('https://gitlab.example.com', 'token-123', fetchMock);
    const project = await client.getProjectMetadata('example-org', 'example-project');

    expect(project).toMatchObject({
      owner: 'example-org',
      project: 'example-project',
      defaultBranch: 'main',
      visibility: 'private'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/v4/projects/example-org%2Fexample-project', 'https://gitlab.example.com'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          'PRIVATE-TOKEN': 'token-123'
        })
      })
    );
  });

  it('paginates file tree responses and resolves README content', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const parsedUrl = new URL(url);

      if (parsedUrl.pathname.includes('/repository/tree') && parsedUrl.searchParams.get('page') === '1') {
        return createJsonResponse(
          [
            { name: 'src', path: 'src', type: 'tree' },
            { name: 'README.md', path: 'README.md', type: 'blob' }
          ],
          {
            headers: {
              'content-type': 'application/json',
              'x-next-page': '2'
            }
          }
        );
      }

      if (parsedUrl.pathname.includes('/repository/tree') && parsedUrl.searchParams.get('page') === '2') {
        return createJsonResponse([{ name: 'index.ts', path: 'src/index.ts', type: 'blob' }]);
      }

      if (url.includes('/repository/files/README.md/raw')) {
        return new Response('# Example README', { status: 200 });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const client = new GitLabApiClient('https://gitlab.example.com', undefined, fetchMock);
    const files = await client.getFileTree('example-org', 'example-project', 'main');
    const readme = await client.getProjectReadme('example-org', 'example-project', 'main', files);

    expect(files).toEqual([
      { name: 'src', path: 'src', type: 'tree' },
      { name: 'README.md', path: 'README.md', type: 'blob' },
      { name: 'index.ts', path: 'src/index.ts', type: 'blob' }
    ]);
    expect(readme).toBe('# Example README');
  });

  it('maps authentication, not found, and rate limit responses to custom errors', async () => {
    const unauthorizedFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('bad token', { status: 401 }));
    const notFoundFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('missing', { status: 404 }));
    const rateLimitFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('slow down', {
        status: 429,
        headers: {
          'retry-after': '60'
        }
      })
    );

    await expect(new GitLabApiClient('https://gitlab.example.com', undefined, unauthorizedFetch).getProjectMetadata('a', 'b')).rejects.toBeInstanceOf(
      GitLabAuthenticationError
    );
    await expect(new GitLabApiClient('https://gitlab.example.com', undefined, notFoundFetch).getProjectMetadata('a', 'b')).rejects.toBeInstanceOf(
      GitLabNotFoundError
    );
    await expect(new GitLabApiClient('https://gitlab.example.com', undefined, rateLimitFetch).getProjectMetadata('a', 'b')).rejects.toMatchObject<
      Partial<GitLabRateLimitError>
    >({
      retryAfterSeconds: 60
    });
  });
});
