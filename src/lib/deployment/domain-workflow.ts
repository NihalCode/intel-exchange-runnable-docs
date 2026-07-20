import "server-only";

import { allDnsChecksMatched, checkDnsRecords } from "@/lib/deployment/dns/verify";
import { getVercelProvider } from "@/lib/deployment/providers";
import { VercelProviderError } from "@/lib/deployment/providers/types";
import {
  getProductDeployment,
  recordDeploymentAuditEvent,
  upsertDomainAutomationRecord,
} from "@/lib/deployment/repository";
import type { DomainWorkflowState } from "@/lib/deployment/types";

function tlsIsActive(status?: string): boolean {
  return status?.toLowerCase() === "active";
}

function workflowStateFromVercelStatus(status: {
  verified: boolean;
  misconfigured: boolean;
  ssl?: { status: string };
}): DomainWorkflowState {
  if (status.verified && tlsIsActive(status.ssl?.status)) return "ready";
  if (status.verified) return "verified";
  if (status.misconfigured) return "dns_mismatch";
  return "waiting_for_dns";
}

async function resolveVercelDomainStatus(
  provider: ReturnType<typeof getVercelProvider>,
  projectId: string,
  domain: string
) {
  try {
    return await provider.getDomainStatus(projectId, domain);
  } catch (error) {
    if (!(error instanceof VercelProviderError && error.code === "NOT_FOUND")) {
      throw error;
    }
    const listed = await provider.listDomains(projectId);
    const match = listed.find((entry) => entry.name.toLowerCase() === domain.toLowerCase());
    if (!match) throw error;
    return provider.getDomainStatus(projectId, match.name);
  }
}

/** Import a domain already attached to the Vercel project into the control plane (no Vercel mutation). */
export async function importExistingDomainOnDeployment(input: {
  organizationId: string;
  userId: string;
  deploymentId: string;
  domain: string;
  requestId?: string;
}): Promise<{ workflowState: DomainWorkflowState; dnsRequirements: unknown[] } | null> {
  const deployment = await getProductDeployment(input.organizationId, input.deploymentId);
  if (!deployment) throw new Error("Deployment not found");

  const provider = getVercelProvider(deployment.vercelTeamId);
  let status;
  try {
    status = await resolveVercelDomainStatus(
      provider,
      deployment.vercelProjectId,
      input.domain
    );
  } catch (error) {
    if (error instanceof VercelProviderError && error.code === "NOT_FOUND") {
      return null;
    }
    throw error;
  }

  const requirements = await provider.getRequiredDnsRecords(
    deployment.vercelProjectId,
    input.domain
  );
  const workflowState = workflowStateFromVercelStatus(status);
  const record = await upsertDomainAutomationRecord({
    organizationId: input.organizationId,
    deploymentId: input.deploymentId,
    domain: input.domain,
    workflowState,
    dnsRequirementsJson: JSON.stringify(requirements),
    tlsStatus: tlsIsActive(status.ssl?.status) ? "active" : "pending",
    lastProviderError: status.misconfigured ? "Domain misconfigured at Vercel" : null,
    isPrimary: true,
  });

  await recordDeploymentAuditEvent({
    organizationId: input.organizationId,
    deploymentId: input.deploymentId,
    domain: input.domain,
    eventType: "domain_imported",
    actorUserId: input.userId,
    requestId: input.requestId,
    payload: { workflowState: record.workflowState, verified: status.verified },
  });

  return { workflowState: record.workflowState, dnsRequirements: requirements };
}

export async function addDomainToDeployment(input: {
  organizationId: string;
  userId: string;
  deploymentId: string;
  domain: string;
  requestId?: string;
}): Promise<{ workflowState: DomainWorkflowState; dnsRequirements: unknown[] }> {
  const deployment = await getProductDeployment(input.organizationId, input.deploymentId);
  if (!deployment) throw new Error("Deployment not found");

  const provider = getVercelProvider(deployment.vercelTeamId);
  const status = await provider.addDomain(deployment.vercelProjectId, input.domain);
  const requirements = await provider.getRequiredDnsRecords(
    deployment.vercelProjectId,
    input.domain
  );

  const record = await upsertDomainAutomationRecord({
    organizationId: input.organizationId,
    deploymentId: input.deploymentId,
    domain: input.domain,
    workflowState: "waiting_for_dns",
    dnsRequirementsJson: JSON.stringify(requirements),
    tlsStatus: tlsIsActive(status.ssl?.status) ? "active" : "pending",
  });

  await recordDeploymentAuditEvent({
    organizationId: input.organizationId,
    deploymentId: input.deploymentId,
    domain: input.domain,
    eventType: "domain_added",
    actorUserId: input.userId,
    requestId: input.requestId,
    payload: { workflowState: record.workflowState },
  });

  return { workflowState: record.workflowState, dnsRequirements: requirements };
}

export async function checkDeploymentDomainDns(input: {
  organizationId: string;
  userId: string;
  deploymentId: string;
  domain: string;
  requestId?: string;
}) {
  const deployment = await getProductDeployment(input.organizationId, input.deploymentId);
  if (!deployment) throw new Error("Deployment not found");

  const provider = getVercelProvider(deployment.vercelTeamId);
  const requirements = await provider.getRequiredDnsRecords(
    deployment.vercelProjectId,
    input.domain
  );
  const results = await checkDnsRecords(input.domain, requirements);
  const matched = allDnsChecksMatched(results);

  const workflowState: DomainWorkflowState = matched ? "dns_propagated" : "dns_mismatch";
  const record = await upsertDomainAutomationRecord({
    organizationId: input.organizationId,
    deploymentId: input.deploymentId,
    domain: input.domain,
    workflowState,
    lastDnsCheckJson: JSON.stringify(results),
    dnsRequirementsJson: JSON.stringify(requirements),
  });

  await recordDeploymentAuditEvent({
    organizationId: input.organizationId,
    deploymentId: input.deploymentId,
    domain: input.domain,
    eventType: "dns_checked",
    actorUserId: input.userId,
    requestId: input.requestId,
    payload: { matched, retryCount: record.dnsRetryCount },
  });

  return { matched, results, workflowState: record.workflowState };
}

export async function verifyDeploymentDomain(input: {
  organizationId: string;
  userId: string;
  deploymentId: string;
  domain: string;
  requestId?: string;
}) {
  const deployment = await getProductDeployment(input.organizationId, input.deploymentId);
  if (!deployment) throw new Error("Deployment not found");

  const provider = getVercelProvider(deployment.vercelTeamId);
  const status = await provider.verifyDomain(deployment.vercelProjectId, input.domain);

  let workflowState: DomainWorkflowState = "verification_pending";
  if (status.verified && status.ssl?.status === "active") workflowState = "ready";
  else if (status.verified) workflowState = "verified";
  else workflowState = "verification_pending";

  const record = await upsertDomainAutomationRecord({
    organizationId: input.organizationId,
    deploymentId: input.deploymentId,
    domain: input.domain,
    workflowState,
    tlsStatus: tlsIsActive(status.ssl?.status) ? "active" : "pending",
    lastProviderError: status.misconfigured ? "Domain misconfigured at Vercel" : null,
  });

  await recordDeploymentAuditEvent({
    organizationId: input.organizationId,
    deploymentId: input.deploymentId,
    domain: input.domain,
    eventType: "domain_verified",
    actorUserId: input.userId,
    requestId: input.requestId,
    payload: { verified: status.verified, tls: status.ssl?.status },
  });

  return { status, workflowState: record.workflowState };
}

export async function removeDeploymentDomain(input: {
  organizationId: string;
  userId: string;
  deploymentId: string;
  domain: string;
  requestId?: string;
}) {
  const deployment = await getProductDeployment(input.organizationId, input.deploymentId);
  if (!deployment) throw new Error("Deployment not found");

  const provider = getVercelProvider(deployment.vercelTeamId);
  await provider.removeDomain(deployment.vercelProjectId, input.domain);

  await upsertDomainAutomationRecord({
    organizationId: input.organizationId,
    deploymentId: input.deploymentId,
    domain: input.domain,
    workflowState: "disabled",
    tlsStatus: "pending",
  });

  await recordDeploymentAuditEvent({
    organizationId: input.organizationId,
    deploymentId: input.deploymentId,
    domain: input.domain,
    eventType: "domain_removed",
    actorUserId: input.userId,
    requestId: input.requestId,
  });
}
