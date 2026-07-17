import "server-only";

import { allDnsChecksMatched, checkDnsRecords } from "@/lib/deployment/dns/verify";
import { getVercelProvider } from "@/lib/deployment/providers";
import {
  getProductDeployment,
  recordDeploymentAuditEvent,
  upsertDomainAutomationRecord,
} from "@/lib/deployment/repository";
import type { DomainWorkflowState } from "@/lib/deployment/types";

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
    tlsStatus: status.ssl?.status === "active" ? "active" : "pending",
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
    tlsStatus: status.ssl?.status === "active" ? "active" : "pending",
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
