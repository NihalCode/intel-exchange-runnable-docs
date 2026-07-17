import type { ProductKey } from "@/lib/products/registry";

export type DeploymentEnvironment = "development" | "preview" | "staging" | "production";

export type ProductDeploymentStatus =
  | "not_configured"
  | "configuring"
  | "ready"
  | "deploying"
  | "failed"
  | "disabled";

export type DomainWorkflowState =
  | "not_configured"
  | "waiting_for_dns"
  | "dns_mismatch"
  | "dns_propagated"
  | "verification_pending"
  | "verified"
  | "tls_pending"
  | "ready"
  | "failed"
  | "disabled";

export interface ProductDeploymentConfiguration {
  id: string;
  organizationId: string;
  product: ProductKey;
  postmanCollectionId: string;
  postmanCollectionVersion: string | null;
  vercelTeamId: string;
  vercelProjectId: string;
  vercelProjectName: string;
  environment: DeploymentEnvironment;
  primaryDomain: string | null;
  additionalDomains: string[];
  enabled: boolean;
  status: ProductDeploymentStatus;
  version: number;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDeploymentInput {
  product: ProductKey;
  postmanCollectionId: string;
  postmanCollectionVersion?: string | null;
  vercelTeamId: string;
  vercelProjectId: string;
  vercelProjectName: string;
  environment: DeploymentEnvironment;
  primaryDomain?: string | null;
  additionalDomains?: string[];
  enabled?: boolean;
  status?: ProductDeploymentStatus;
}

export interface DnsCheckResult {
  recordType: "A" | "AAAA" | "CNAME" | "TXT";
  expected: string[];
  actual: string[];
  matched: boolean;
  checkedAt: string;
}

export interface DomainAutomationRecord {
  id: string;
  organizationId: string;
  deploymentId: string;
  domain: string;
  workflowState: DomainWorkflowState;
  vercelDomainId: string | null;
  dnsRequirementsJson: string;
  lastDnsCheckJson: string | null;
  lastDnsCheckAt: string | null;
  dnsRetryCount: number;
  tlsStatus: "pending" | "active" | "failed" | "expired";
  lastProviderError: string | null;
  isPrimary: boolean;
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}
