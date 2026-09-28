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

      if (url === 'https://api.github.com/repos/owner/project/git/trees/main?recursive=1') {
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
});
