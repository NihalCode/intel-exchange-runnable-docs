import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  db,
  resetDatabaseConnection,
  setTestDatabasePath,
  withOrganizationTransaction,
} from "@/lib/db/client";
import { createUserFromInvite } from "@/lib/db/repository";
import { createApiKey, hashApiKey, verifyApiKey } from "@/lib/enterprise/api-keys";
import {
  appendEnterpriseAuditEvent,
  listEnterpriseAuditEvents,
} from "@/lib/enterprise/audit";
import {
  activateChangeRequest,
  createChangeRequest,
  markChangeDeploying,
  reviewChangeRequest,
  scheduleChangeRequest,
  submitChangeRequest,
} from "@/lib/enterprise/change-workflow";
import { computeSanitizedConfigDiff } from "@/lib/enterprise/change-detail";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  createCsrfToken,
  validateMutationCsrf,
} from "@/lib/enterprise/csrf";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import {
  createControlPlaneResource,
  createMembership,
  createOrganization,
  enqueueJob,
  claimDueJobs,
  completeJob,
  findControlPlaneResource,
  getActiveConfigForResource,
  getConfigVersionDetail,
  listDueScheduledChanges,
  listJobs,
} from "@/lib/enterprise/repository";
import {
  getSecuritySettings,
  updateSecuritySettings,
} from "@/lib/enterprise/security-settings";
import { processControlPlaneJobs } from "@/lib/enterprise/job-processor";
import { createVaultProvider, resolveVaultProviderKind } from "@/lib/enterprise/vault-providers";
import { isPublicDocumentationApiPath } from "@/lib/documentation-auth/proxy-auth";
import type { EnterprisePrincipal } from "@/lib/enterprise/types";

describe("enterprise authorization policy", () => {
  const developer: EnterprisePrincipal = {
    userId: "developer",
    organizationId: "org-a",
    role: "developer",
    status: "active",
  };

  it("denies unknown roles and cross-organization access", () => {
    expect(
      authorizeEnterprise(
        { ...developer, role: "viewer" },
        "admin_dashboard.access"
      )
    ).toBe(false);
    expect(
      authorizeEnterprise(developer, "resources.read", {
        organizationId: "org-b",
      })
    ).toBe(false);
  });

  it("allows admin dashboard but denies developer production writes and sensitive actions", () => {
    expect(authorizeEnterprise(developer, "admin_dashboard.access")).toBe(true);
    expect(
      authorizeEnterprise(developer, "resources.write", {
        organizationId: "org-a",
        environment: "production",
      })
    ).toBe(false);
    expect(authorizeEnterprise(developer, "changes.approve")).toBe(false);
    expect(authorizeEnterprise(developer, "security_settings.manage")).toBe(
      false
    );
    expect(authorizeEnterprise(developer, "audit.read_sensitive")).toBe(false);
  });
});

describe("enterprise CSRF", () => {
  beforeEach(() => {
    process.env.CSRF_SIGNING_SECRET =
      "enterprise-csrf-test-secret-at-least-32-characters";
  });

  afterEach(() => {
    delete process.env.CSRF_SIGNING_SECRET;
  });

  it("requires same origin and matching signed double-submit token", () => {
    const token = createCsrfToken();
    const request = new Request("https://docs.example.com/api/admin/change", {
      method: "POST",
      headers: {
        host: "docs.example.com",
        origin: "https://docs.example.com",
        cookie: `${CSRF_COOKIE_NAME}=${token}`,
        [CSRF_HEADER_NAME]: token,
      },
    });
    expect(validateMutationCsrf(request)).toBe(true);

    const crossOrigin = new Request(
      "https://docs.example.com/api/admin/change",
      {
        method: "POST",
        headers: {
          host: "docs.example.com",
          origin: "https://evil.example",
          cookie: `${CSRF_COOKIE_NAME}=${token}`,
          [CSRF_HEADER_NAME]: token,
        },
      }
    );
    expect(validateMutationCsrf(crossOrigin)).toBe(false);
  });
});

describe("enterprise persistence and workflows", () => {
  let dbPath: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let requesterId: string;
  let approverId: string;
  let resourceId: string;

  beforeEach(async () => {
    dbPath = path.join(
      os.tmpdir(),
      `enterprise-control-plane-${Date.now()}-${Math.random()}.db`
    );
    setTestDatabasePath(dbPath);
    resetDatabaseConnection();

    const requester = await createUserFromInvite({
      auth0UserId: "auth0|enterprise-requester",
      email: "requester@enterprise.test",
      role: "owner",
    });
    const approver = await createUserFromInvite({
      auth0UserId: "auth0|enterprise-approver",
      email: "approver@enterprise.test",
      role: "admin",
    });
    requesterId = requester.id;
    approverId = approver.id;

    const organization = await createOrganization({
      name: "Enterprise",
      slug: `enterprise-${Date.now()}`,
      auth0OrganizationId: "org_auth0_enterprise",
    });
    organizationId = organization.id;
    const other = await createOrganization({
      name: "Other",
      slug: `other-${Date.now()}`,
      auth0OrganizationId: "org_auth0_other",
    });
    otherOrganizationId = other.id;
    await createMembership({
      organizationId,
      userId: requesterId,
      role: "owner",
    });
    await createMembership({
      organizationId,
      userId: approverId,
      role: "admin",
    });

    const resource = await createControlPlaneResource({
      organizationId,
      resourceType: "docs-agent",
      name: "primary",
      environment: "production",
      createdByUserId: requesterId,
    });
    resourceId = resource.id;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // Ignore Windows cleanup races after SQLite closes.
    }
  });

  function principal(userId: string, role: "owner" | "admin") {
    return {
      userId,
      organizationId,
      role,
      status: "active" as const,
    };
  }

  function workflowContext(userId: string, role: "owner" | "admin") {
    return {
      principal: principal(userId, role),
      correlationId: `correlation-${userId}`,
      requestId: `request-${userId}`,
    };
  }

  it("enforces organization filters in repositories", async () => {
    expect(
      await findControlPlaneResource(otherOrganizationId, resourceId)
    ).toBeNull();
    expect(
      await findControlPlaneResource(organizationId, resourceId)
    ).not.toBeNull();
  });

  it("stores only API key hash metadata and returns plaintext once", async () => {
    const issued = await createApiKey({
      organizationId,
      name: "automation",
      environment: "staging",
      createdByUserId: requesterId,
    });
    expect(issued.plaintext).toMatch(/^ix_/);
    expect(issued.metadata.last4).toBe(issued.plaintext.slice(-4));
    expect(issued.metadata).not.toHaveProperty("keyHash");

    const row = await withOrganizationTransaction(
      { organizationId, userId: requesterId },
      (transaction) =>
        transaction.queryOne<{
          key_hash: string;
          last4: string;
          vault_ref: string | null;
        }>(
          "SELECT key_hash, last4, vault_ref FROM api_credential_metadata WHERE id = ?",
          [issued.metadata.id]
        )
    );
    expect(row?.key_hash).toBe(hashApiKey(issued.plaintext));
    expect(JSON.stringify(row)).not.toContain(issued.plaintext);
    expect(await verifyApiKey(organizationId, issued.plaintext)).not.toBeNull();
    expect(await verifyApiKey(organizationId, `${issued.plaintext}x`)).toBeNull();
  });

  it("redacts nested audit secrets and keeps events immutable", async () => {
    await withOrganizationTransaction(
      { organizationId, userId: requesterId },
      (transaction) =>
        appendEnterpriseAuditEvent(
          {
            organizationId,
            actorUserId: requesterId,
            action: "test.redaction",
            outcome: "success",
            correlationId: "corr-redaction",
            metadata: {
              nested: {
                apiKey: "ix_should-never-appear",
                message: "Authorization: Bearer abc.def.ghi",
              },
            },
          },
          transaction
        )
    );
    const events = await withOrganizationTransaction(
      { organizationId, userId: requesterId },
      (transaction) =>
        listEnterpriseAuditEvents(organizationId, 10, transaction)
    );
    expect(JSON.stringify(events)).not.toContain("ix_should-never-appear");
    expect(JSON.stringify(events)).not.toContain("abc.def.ghi");
    await expect(
      db.execute("DELETE FROM enterprise_audit_events WHERE id = ?", [
        events[0]!.id,
      ])
    ).rejects.toThrow(/immutable/);
  });

  it("denies self approval and completes valid workflow transitions atomically", async () => {
    const requester = workflowContext(requesterId, "owner");
    const approver = workflowContext(approverId, "admin");
    const draft = await createChangeRequest(requester, {
      resourceId,
      config: { model: "docs-agent-v2", secretRef: "env://AGENT_SECRET" },
      diff: { model: { from: "v1", to: "v2" }, token: "do-not-audit" },
      idempotencyKey: "workflow-transition-test",
    });
    const sameDraft = await createChangeRequest(requester, {
      resourceId,
      config: { model: "docs-agent-v2", secretRef: "env://AGENT_SECRET" },
      diff: { model: { from: "v1", to: "v2" }, token: "do-not-audit" },
      idempotencyKey: "workflow-transition-test",
    });
    expect(sameDraft.id).toBe(draft.id);

    const pending = await submitChangeRequest(
      requester,
      draft.id,
      draft.version
    );
    await expect(
      reviewChangeRequest(requester, {
        id: pending.id,
        expectedVersion: pending.version,
        decision: "APPROVED",
      })
    ).rejects.toMatchObject({ code: "SELF_APPROVAL" });

    const approved = await reviewChangeRequest(approver, {
      id: pending.id,
      expectedVersion: pending.version,
      decision: "APPROVED",
    });
    const deploying = await markChangeDeploying(
      approver,
      approved.id,
      approved.version
    );
    const active = await activateChangeRequest(approver, {
      id: deploying.id,
      expectedVersion: deploying.version,
      expectedResourceVersion: 1,
    });
    expect(active.state).toBe("ACTIVE");
    expect(active.approvedByUserId).toBe(approverId);
  });

  it("schedules approved changes for future activation", async () => {
    const requester = workflowContext(requesterId, "owner");
    const approver = workflowContext(approverId, "admin");
    const draft = await createChangeRequest(requester, {
      resourceId,
      config: { mode: "scheduled" },
      diff: { mode: { from: "v1", to: "scheduled" } },
      idempotencyKey: "schedule-test",
    });
    const pending = await submitChangeRequest(requester, draft.id, draft.version);
    const approved = await reviewChangeRequest(approver, {
      id: pending.id,
      expectedVersion: pending.version,
      decision: "APPROVED",
    });
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const scheduled = await scheduleChangeRequest(approver, {
      id: approved.id,
      expectedVersion: approved.version,
      scheduledFor,
    });
    expect(scheduled.state).toBe("SCHEDULED");
    expect(scheduled.scheduledFor).toBe(scheduledFor);
  });

  it("returns sanitized config diff against active configuration", async () => {
    const requester = workflowContext(requesterId, "owner");
    const draft = await createChangeRequest(requester, {
      resourceId,
      config: { mode: "detail-test", token: "secret-value" },
      diff: { mode: { from: "v1", to: "detail-test" } },
      idempotencyKey: "detail-test",
    });
    const target = await getConfigVersionDetail(
      organizationId,
      draft.targetConfigVersionId
    );
    expect(target).not.toBeNull();
    const active = await getActiveConfigForResource(organizationId, resourceId);
    const diff = computeSanitizedConfigDiff(active, target!.config);
    expect(diff).toHaveProperty("mode");
    expect(JSON.stringify(diff)).not.toContain("secret-value");
  });

  it("manages security settings with optimistic locking", async () => {
    const initial = await getSecuritySettings(organizationId);
    expect(initial.version).toBe(0);
    const saved = await updateSecuritySettings({
      organizationId,
      actorUserId: requesterId,
      expectedVersion: 0,
      patch: { auditRetentionDays: 120 },
    });
    expect(saved.version).toBe(1);
    expect(saved.settings.auditRetentionDays).toBe(120);
  });

  it("enqueues, claims, and completes background jobs", async () => {
    const job = await enqueueJob({
      organizationId,
      jobType: "noop",
      payload: { source: "test" },
    });
    expect(job.status).toBe("queued");
    const claimed = await withOrganizationTransaction(
      { organizationId, userId: requesterId },
      (transaction) =>
        claimDueJobs(
          { organizationId, lockedBy: "test-worker", limit: 5 },
          transaction
        )
    );
    expect(claimed.some((entry) => entry.id === job.id)).toBe(true);
    const running = claimed.find((entry) => entry.id === job.id)!;
    await withOrganizationTransaction(
      { organizationId, userId: requesterId },
      (transaction) =>
        completeJob(
          {
            organizationId,
            id: running.id,
            expectedVersion: running.version,
            result: { ok: true },
          },
          transaction
        )
    );
    const jobs = await listJobs(organizationId);
    expect(jobs.find((entry) => entry.id === job.id)?.status).toBe("completed");
  });

  it("activates due scheduled changes during job processing", async () => {
    const requester = workflowContext(requesterId, "owner");
    const approver = workflowContext(approverId, "admin");
    const draft = await createChangeRequest(requester, {
      resourceId,
      config: { mode: "cron-activate" },
      diff: { mode: { from: "v1", to: "cron-activate" } },
      idempotencyKey: "cron-activate-test",
    });
    const pending = await submitChangeRequest(requester, draft.id, draft.version);
    const approved = await reviewChangeRequest(approver, {
      id: pending.id,
      expectedVersion: pending.version,
      decision: "APPROVED",
    });
    const past = new Date(Date.now() - 60_000).toISOString();
    await withOrganizationTransaction(
      { organizationId, userId: approverId },
      (transaction) =>
        transaction.execute(
          `UPDATE change_requests
           SET state = 'SCHEDULED', scheduled_for = ?, version = version + 1, updated_at = ?
           WHERE organization_id = ? AND id = ?`,
          [past, new Date().toISOString(), organizationId, approved.id]
        )
    );
    const due = await listDueScheduledChanges(organizationId, new Date().toISOString());
    expect(due.some((entry) => entry.id === approved.id)).toBe(true);
    const result = await processControlPlaneJobs({ organizationId, limit: 10 });
    expect(result.scheduledChangesActivated).toBeGreaterThanOrEqual(1);
  });
});

describe("enterprise public health endpoints", () => {
  it("allows unauthenticated load balancer probes", () => {
    expect(isPublicDocumentationApiPath("/api/health/live")).toBe(true);
    expect(isPublicDocumentationApiPath("/api/health/ready")).toBe(true);
    expect(isPublicDocumentationApiPath("/api/admin/control-plane/context")).toBe(
      false
    );
  });
});

describe("enterprise vault providers", () => {
  afterEach(() => {
    delete process.env.VAULT_PROVIDER;
  });

  it("creates an environment vault provider when configured", () => {
    process.env.VAULT_PROVIDER = "env";
    expect(resolveVaultProviderKind()).toBe("env");
    expect(createVaultProvider()).not.toBeNull();
  });
});
