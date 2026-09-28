import { describe, expect, it, vi } from 'vitest';

import { detectRepositoryType, fetchRepositoryData } from './repository-adapter.js';

function createJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    },
    ...init
  });
}

describe('detectRepositoryType', () => {
  it('detects GitLab references', () => {
    expect(detectRepositoryType('https://gitlab.com/group/project')).toBe('gitlab');
    expect(detectRepositoryType('gitlab.example.com/group/project')).toBe('gitlab');
  });

  it('defaults ambiguous references to GitHub', () => {
    expect(detectRepositoryType('owner/project')).toBe('github');
    expect(detectRepositoryType('https://github.com/owner/project')).toBe('github');
    expect(detectRepositoryType('https://example.com/owner/project')).toBe('github');
  });
});

describe('fetchRepositoryData', () => {
  it('normalizes GitLab data into the shared repository format', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.endsWith('/api/v4/projects/group%2Fproject')) {
        return createJsonResponse({
          id: 1,
          name: 'project',
          description: 'GitLab project',
          default_branch: 'main',
          visibility: 'public',
          web_url: 'https://gitlab.com/group/project'
        });
      }

      if (url.includes('/repository/tree')) {
        return createJsonResponse([{ name: 'README.md', path: 'README.md', type: 'blob' }]);
      }

      if (url.includes('/repository/files/README.md/raw')) {
        return new Response('# GitLab README', { status: 200 });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(fetchRepositoryData('https://gitlab.com/group/project', undefined, fetchMock)).resolves.toEqual({
      provider: 'gitlab',
      project: {
        instanceUrl: 'https://gitlab.com',
        owner: 'group',
        project: 'project',
        id: 1,
        name: 'project',
        description: 'GitLab project',
        defaultBranch: 'main',
        visibility: 'public',
        webUrl: 'https://gitlab.com/group/project'
      },
      branch: 'main',
      files: [{ name: 'README.md', path: 'README.md', type: 'blob' }],
      readme: '# GitLab README'
    });
  });

  it('normalizes GitHub data for compatibility with the same pipeline', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url === 'https://api.github.com/repos/owner/project') {
        return createJsonResponse({
          name: 'project',
          description: 'GitHub project',
          default_branch: 'main',
          private: false,
          html_url: 'https://github.com/owner/project'
        });
      }

      if (url === 'https://api.github.com/repos/owner/project/branches/main') {
        return createJsonResponse({
          commit: {
            commit: {
              tree: {
                sha: 'tree-sha-123'
              }
            }
          }
        });
      }

      if (url === 'https://api.github.com/repos/owner/project/git/trees/tree-sha-123?recursive=1') {
        return createJsonResponse({
          tree: [{ path: 'README.md', type: 'blob' }]
        });
      }

      if (url === 'https://api.github.com/repos/owner/project/readme?ref=main') {
        return createJsonResponse({
          content: Buffer.from('# GitHub README').toString('base64'),
          encoding: 'base64'
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(fetchRepositoryData('owner/project', undefined, fetchMock)).resolves.toEqual({
      provider: 'github',
      project: {
        instanceUrl: 'https://github.com',
        owner: 'owner',
        project: 'project',
        name: 'project',
        description: 'GitHub project',
        defaultBranch: 'main',
        visibility: 'public',
        webUrl: 'https://github.com/owner/project'
      },
      branch: 'main',
      files: [{ name: 'README.md', path: 'README.md', type: 'blob' }],
      readme: '# GitHub README'
    });
  });

  it('supports self-hosted GitLab instances after probing the GitLab version endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url === 'https://example.com/api/v4/version') {
        return createJsonResponse({ version: '17.0.0' });
      }

      if (url === 'https://example.com/api/v4/projects/group%2Fproject') {
        return createJsonResponse({
          id: 2,
          name: 'project',
          description: null,
          default_branch: 'main',
          visibility: 'private',
          web_url: 'https://example.com/group/project'
        });
      }

      if (url.includes('/repository/tree')) {
        return createJsonResponse([{ name: 'README.md', path: 'README.md', type: 'blob' }]);
      }

      if (url.includes('/repository/files/README.md/raw')) {
        return new Response('# Self-hosted README', { status: 200 });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(fetchRepositoryData('https://example.com/group/project', undefined, fetchMock)).resolves.toMatchObject({
      provider: 'gitlab',
      project: {
        instanceUrl: 'https://example.com',
        owner: 'group',
        project: 'project',
        id: 2
      },
      readme: '# Self-hosted README'
    });
  });

  it('preserves non-base64 GitHub README content', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url === 'https://api.github.com/repos/owner/project') {
        return createJsonResponse({
          name: 'project',
          description: null,
          default_branch: 'main',
          private: true,
          html_url: 'https://github.com/owner/project'
        });
      }

      if (url === 'https://api.github.com/repos/owner/project/branches/main') {
        return createJsonResponse({
          commit: {
            commit: {
              tree: {
                sha: 'tree-sha-raw'
              }
            }
          }
        });
      }

      if (url === 'https://api.github.com/repos/owner/project/git/trees/tree-sha-raw?recursive=1') {
        return createJsonResponse({
          tree: [{ path: 'README.md', type: 'blob' }]
        });
      }

      if (url === 'https://api.github.com/repos/owner/project/readme?ref=main') {
        return createJsonResponse({
          content: '# Plain README',
          encoding: 'utf8'
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(fetchRepositoryData('owner/project', 'github-token', fetchMock)).resolves.toMatchObject({
      provider: 'github',
      project: {
        visibility: 'private'
      },
      readme: '# Plain README'
    });
  });
});
