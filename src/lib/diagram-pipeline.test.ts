import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { generateDiagramImage } from './diagram-pipeline.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'gitdiagram-gitlab-'));
  tempDirs.push(directory);
  return directory;
}

describe('generateDiagramImage', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(async (directory) => {
      await import('node:fs/promises').then(({ rm }) => rm(directory, { recursive: true, force: true }));
    }));
  });

  it('fetches repository data and writes a single svg image to disk', async () => {
    const outputDir = await createTempDir();
    const outputPath = join(outputDir, 'diagram.svg');

    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);

      if (url === 'https://gitlab.com/api/v4/projects/group%2Fproject') {
        return new Response(JSON.stringify({
          id: 7,
          name: 'project',
          description: 'GitLab package pipeline',
          default_branch: 'main',
          visibility: 'public',
          web_url: 'https://gitlab.com/group/project'
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (url.includes('/repository/tree')) {
        return new Response(JSON.stringify([
          { name: 'README.md', path: 'README.md', type: 'blob' },
          { name: 'src', path: 'src', type: 'tree' }
        ]), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (url.includes('/repository/files/README.md/raw')) {
        return new Response('# Package pipeline', { status: 200 });
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    const result = await generateDiagramImage({
      repositoryUrl: 'https://gitlab.com/group/project',
      outputPath,
      fetchImpl: fetchMock
    });

    const savedSvg = await readFile(outputPath, 'utf8');

    expect(result).toMatchObject({
      outputPath,
      provider: 'gitlab',
      repository: 'group/project',
      imageFormat: 'svg'
    });
    expect(savedSvg).toContain('<svg');
    expect(savedSvg).toContain('group/project');
    expect(savedSvg).not.toContain('video');
    expect(savedSvg).not.toContain('frontend');
  });

  it('uses a default output path when one is not provided', async () => {
    const currentWorkingDirectory = process.cwd();
    const outputDir = await createTempDir();
    process.chdir(outputDir);

    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);

      if (url === 'https://gitlab.com/api/v4/projects/group%2Fproject') {
        return new Response(JSON.stringify({
          id: 8,
          name: 'project',
          description: null,
          default_branch: 'main',
          visibility: 'private',
          web_url: 'https://gitlab.com/group/project'
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (url.includes('/repository/tree')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    try {
      const result = await generateDiagramImage({
        repositoryUrl: 'https://gitlab.com/group/project',
        fetchImpl: fetchMock
      });

      expect(result.outputPath).toBe(join(outputDir, 'project-diagram.svg'));
      expect(await readFile(result.outputPath, 'utf8')).toContain('<svg');
    } finally {
      process.chdir(currentWorkingDirectory);
    }
  });
});
