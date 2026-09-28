import { describe, expect, it } from 'vitest';

import { parseGitLabUrl } from './gitlab-url.js';

describe('parseGitLabUrl', () => {
  it('parses a full gitlab.com URL', () => {
    expect(parseGitLabUrl('https://gitlab.com/example-org/example-project')).toEqual({
      instanceUrl: 'https://gitlab.com',
      owner: 'example-org',
      project: 'example-project'
    });
  });

  it('parses a gitlab.com URL without a scheme', () => {
    expect(parseGitLabUrl('gitlab.com/example-org/example-project')).toEqual({
      instanceUrl: 'https://gitlab.com',
      owner: 'example-org',
      project: 'example-project'
    });
  });

  it('parses an owner/project path using the default GitLab instance', () => {
    expect(parseGitLabUrl('example-org/example-project')).toEqual({
      instanceUrl: 'https://gitlab.com',
      owner: 'example-org',
      project: 'example-project'
    });
  });

  it('supports self-hosted instances, subgroups, and .git suffixes', () => {
    expect(parseGitLabUrl('https://gitlab.example.com/group/subgroup/project.git?ref=main')).toEqual({
      instanceUrl: 'https://gitlab.example.com',
      owner: 'group/subgroup',
      project: 'project'
    });
  });

  it('ignores special GitLab routes after the project path', () => {
    expect(parseGitLabUrl('https://gitlab.example.com/group/project/-/blob/main/README.md')).toEqual({
      instanceUrl: 'https://gitlab.example.com',
      owner: 'group',
      project: 'project'
    });
  });

  it('throws for invalid references', () => {
    expect(() => parseGitLabUrl('group-only')).toThrow(/Invalid GitLab project reference/);
    expect(() => parseGitLabUrl('')).toThrow(/required/);
  });
});
