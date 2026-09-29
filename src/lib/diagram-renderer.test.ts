import { describe, expect, it } from 'vitest';

import { renderRepositoryDiagramSvg } from './diagram-renderer.js';
import type { RepositoryData } from '../types/gitlab.js';

const repositoryData: RepositoryData = {
  provider: 'gitlab',
  project: {
    instanceUrl: 'https://gitlab.com',
    owner: 'team/platform',
    project: 'gitdiagram-gitlab',
    id: 1,
    name: 'gitdiagram-gitlab',
    description: 'Diagram <repo> & package',
    defaultBranch: 'main',
    visibility: 'public',
    webUrl: 'https://gitlab.com/team/platform/gitdiagram-gitlab'
  },
  branch: 'main',
  files: [
    { path: 'README.md', name: 'README.md', type: 'blob' },
    { path: 'src/lib', name: 'lib', type: 'tree' },
    { path: 'src/index.ts', name: 'index.ts', type: 'blob' }
  ],
  readme: '# Title\nDiagram generator package'
};

describe('renderRepositoryDiagramSvg', () => {
  it('renders a standalone svg image with repository metadata and files', () => {
    const svg = renderRepositoryDiagramSvg(repositoryData, { maxFiles: 2, width: 800 });

    expect(svg).toContain('<svg');
    expect(svg).toContain('team/platform/gitdiagram-gitlab');
    expect(svg).toContain('Provider: gitlab');
    expect(svg).toContain('README.md');
    expect(svg).toContain('+ 1 more files');
  });

  it('escapes xml content from repository metadata', () => {
    const svg = renderRepositoryDiagramSvg({
      ...repositoryData,
      project: {
        ...repositoryData.project,
        description: 'A & B < C > D'
      }
    });

    expect(svg).toContain('A &amp; B &lt; C &gt; D');
  });
});
