export interface GitLabProject {
  instanceUrl: string;
  owner: string;
  project: string;
  id?: number;
  name: string;
  description: string | null;
  defaultBranch: string;
  visibility: string;
  webUrl: string;
}

export interface GitLabFile {
  path: string;
  name: string;
  type: 'blob' | 'tree';
}

export interface GitLabData {
  provider: 'gitlab';
  project: GitLabProject;
  branch: string;
  files: GitLabFile[];
  readme: string | null;
}

export interface RepositoryData {
  provider: 'github' | 'gitlab';
  project: {
    instanceUrl: string;
    owner: string;
    project: string;
    name: string;
    description: string | null;
    defaultBranch: string;
    visibility: string;
    webUrl: string;
  };
  branch: string;
  files: GitLabFile[];
  readme: string | null;
}
