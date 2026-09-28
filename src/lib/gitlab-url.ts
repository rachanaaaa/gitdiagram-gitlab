export interface ParsedGitLabUrl {
  instanceUrl: string;
  owner: string;
  project: string;
}

const DEFAULT_GITLAB_INSTANCE = 'https://gitlab.com';

function stripTrailingSlashes(value: string): string {
  let end = value.length;

  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }

  return value.slice(0, end);
}

function normalizeInput(value: string): string {
  return stripTrailingSlashes(value.trim());
}

function normalizeInstanceUrl(value: string): string {
  return stripTrailingSlashes(value);
}

function isHostLike(segment: string): boolean {
  return segment === 'localhost' || segment.includes('.') || segment.includes(':');
}

function extractProjectSegments(pathname: string): string[] {
  const segments = pathname.split('/').filter(Boolean);
  const specialRouteIndex = segments.indexOf('-');
  const projectSegments = specialRouteIndex >= 0 ? segments.slice(0, specialRouteIndex) : segments;

  if (projectSegments.length < 2) {
    throw new Error(`Invalid GitLab project path: "${pathname}"`);
  }

  return projectSegments;
}

function buildParsedUrl(instanceUrl: string, segments: string[]): ParsedGitLabUrl {
  const cleanedSegments = [...segments];
  const project = cleanedSegments.pop()?.replace(/\.git$/i, '');

  if (!project) {
    throw new Error('GitLab project name is missing');
  }

  const owner = cleanedSegments.join('/');

  if (!owner) {
    throw new Error('GitLab owner or namespace is missing');
  }

  return {
    instanceUrl: normalizeInstanceUrl(instanceUrl),
    owner,
    project
  };
}

/**
 * Parses a GitLab project URL or namespace path into a structured format.
 */
export function parseGitLabUrl(input: string): ParsedGitLabUrl {
  const normalized = normalizeInput(input);

  if (!normalized) {
    throw new Error('GitLab project URL is required');
  }

  if (normalized.includes('://')) {
    const url = new URL(normalized);

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Unsupported GitLab URL protocol: ${url.protocol}`);
    }

    return buildParsedUrl(url.origin, extractProjectSegments(url.pathname));
  }

  const [pathOnly] = normalized.split(/[?#]/, 1);
  const segments = pathOnly.split('/').filter(Boolean);

  if (segments.length < 2) {
    throw new Error(`Invalid GitLab project reference: "${input}"`);
  }

  if (isHostLike(segments[0]!)) {
    return buildParsedUrl(`https://${segments[0]}`, extractProjectSegments(`/${segments.slice(1).join('/')}`));
  }

  return buildParsedUrl(DEFAULT_GITLAB_INSTANCE, extractProjectSegments(`/${segments.join('/')}`));
}
