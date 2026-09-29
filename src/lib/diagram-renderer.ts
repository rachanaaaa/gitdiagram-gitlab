import type { RepositoryData } from '../types/gitlab.js';

export interface DiagramRenderOptions {
  maxFiles?: number;
  width?: number;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

/**
 * Renders repository data into a standalone SVG diagram image.
 */
export function renderRepositoryDiagramSvg(data: RepositoryData, options: DiagramRenderOptions = {}): string {
  const maxFiles = options.maxFiles ?? 12;
  const width = options.width ?? 1200;
  const visibleFiles = data.files.slice(0, maxFiles);
  const height = 220 + visibleFiles.length * 28;
  const title = `${data.project.owner}/${data.project.project}`;
  const description = data.project.description ?? 'No description provided';
  const readmeSummary = data.readme
    ? truncate(data.readme.replace(/\s+/g, ' ').trim(), 180)
    : 'No README detected';

  const fileRows = visibleFiles
    .map((file, index) => {
      const y = 188 + index * 28;
      return `
    <rect x="64" y="${y}" width="${width - 128}" height="20" rx="6" fill="${file.type === 'tree' ? '#E0E7FF' : '#E5E7EB'}" />
    <text x="84" y="${y + 14}" font-family="Inter, Arial, sans-serif" font-size="12" fill="#111827">${escapeXml(file.path)}</text>`;
    })
    .join('');

  const remainingCount = data.files.length - visibleFiles.length;
  const remainingFilesLabel = remainingCount > 0
    ? `<text x="64" y="${height - 24}" font-family="Inter, Arial, sans-serif" font-size="12" fill="#6B7280">+ ${remainingCount} more files</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Repository diagram for ${escapeXml(title)}</title>
  <desc id="desc">Diagram of ${escapeXml(title)} showing provider, branch, README summary, and top repository paths.</desc>
  <rect width="${width}" height="${height}" fill="#F8FAFC" />
  <rect x="32" y="24" width="${width - 64}" height="${height - 48}" rx="18" fill="#FFFFFF" stroke="#CBD5E1" />
  <text x="64" y="72" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#0F172A">${escapeXml(title)}</text>
  <text x="64" y="100" font-family="Inter, Arial, sans-serif" font-size="14" fill="#475569">Provider: ${escapeXml(data.provider)} • Branch: ${escapeXml(data.branch)}</text>
  <text x="64" y="126" font-family="Inter, Arial, sans-serif" font-size="14" fill="#334155">${escapeXml(truncate(description, 120))}</text>
  <text x="64" y="152" font-family="Inter, Arial, sans-serif" font-size="13" fill="#64748B">README: ${escapeXml(readmeSummary)}</text>
  <text x="64" y="178" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" fill="#0F172A">Repository structure</text>${fileRows}
  ${remainingFilesLabel}
</svg>`;
}
