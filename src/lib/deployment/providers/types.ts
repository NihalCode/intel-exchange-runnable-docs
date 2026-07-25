export interface VercelProjectSummary {
  id: string;
  name: string;
  accountId?: string;
}

export interface VercelDomainSummary {
  name: string;
  verified: boolean;
  configured: boolean;
}

export interface VercelDnsRequirement {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}

export interface VercelDomainStatus {
  name: string;
  verified: boolean;
  configured: boolean;
  misconfigured: boolean;
  verification?: { type: string; domain: string; value: string }[];
  ssl?: { status: string };
}

export interface VercelDeploymentGitMeta {
  githubCommitSha?: string;
  githubCommitMessage?: string;
  githubCommitAuthorName?: string;
  githubCommitRef?: string;
  githubCommitOrg?: string;
  githubCommitRepo?: string;
}

export interface VercelDeploymentSummary {
  id: string;
  url: string;
  state: string;
  createdAt: string;
  meta?: VercelDeploymentGitMeta;
}

/** Max deployments fetched per product for Commits / promote history. */
export const VERCEL_DEPLOYMENT_LIST_LIMIT = 25;

export interface VercelProvider {
  listProjects(): Promise<VercelProjectSummary[]>;
  getProject(projectId: string): Promise<VercelProjectSummary | null>;
  listDomains(projectId: string): Promise<VercelDomainSummary[]>;
  addDomain(projectId: string, domain: string): Promise<VercelDomainStatus>;
  getDomainStatus(projectId: string, domain: string): Promise<VercelDomainStatus>;
  verifyDomain(projectId: string, domain: string): Promise<VercelDomainStatus>;
  getRequiredDnsRecords(projectId: string, domain: string): Promise<VercelDnsRequirement[]>;
  removeDomain(projectId: string, domain: string): Promise<void>;
  listDeployments(projectId: string): Promise<VercelDeploymentSummary[]>;
  promoteDeployment(deploymentId: string): Promise<VercelDeploymentSummary>;
  rollbackDeployment(projectId: string): Promise<VercelDeploymentSummary>;
}

export class VercelProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "VercelProviderError";
  }
}
