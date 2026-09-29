import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { fetchRepositoryData } from './repository-adapter.js';
import { renderRepositoryDiagramSvg, type DiagramRenderOptions } from './diagram-renderer.js';
import type { RepositoryData } from '../types/gitlab.js';

export interface GenerateDiagramImageOptions extends DiagramRenderOptions {
  repositoryUrl: string;
  token?: string;
  outputPath?: string;
  fetchImpl?: typeof fetch;
}

export interface GeneratedDiagramImage {
  outputPath: string;
  provider: RepositoryData['provider'];
  repository: string;
  imageFormat: 'svg';
  svg: string;
}

function defaultOutputPath(data: RepositoryData): string {
  return resolve(process.cwd(), `${data.project.project}-diagram.svg`);
}

/**
 * Runs the package pipeline: fetch repository data, render one diagram image, and save it to disk.
 */
export async function generateDiagramImage(options: GenerateDiagramImageOptions): Promise<GeneratedDiagramImage> {
  const repositoryData = await fetchRepositoryData(options.repositoryUrl, options.token, options.fetchImpl);
  const svg = renderRepositoryDiagramSvg(repositoryData, options);
  const outputPath = resolve(options.outputPath ?? defaultOutputPath(repositoryData));

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, svg, 'utf8');

  return {
    outputPath,
    provider: repositoryData.provider,
    repository: `${repositoryData.project.owner}/${repositoryData.project.project}`,
    imageFormat: 'svg',
    svg
  };
}
