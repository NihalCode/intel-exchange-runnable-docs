/**
 * Commit meta normalization + Commits tab / promote_commit workflow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  firstLineMessage,
  githubCommitUrl,
  normalizeVercelDeploymentMeta,
  shortSha,
} from "@/lib/deployment/commit-meta";
import {
  assertApprovedCommitSwitch,
  isPromoteCommitConfig,
  proposeCommitSwitch,
  PROMOTE_COMMIT_ACTION,
} from "@/lib/deployment/commit-change-requests";
import { createFakeVercelProvider } from "@/lib/deployment/providers/fake-vercel-provider";
import { VERCEL_DEPLOYMENT_LIST_LIMIT } from "@/lib/deployment/providers/types";
import {
  resetDatabaseConnection,
  setTestDatabasePath,
  db,
} from "@/lib/db/client";
import { createUserFromInvite } from "@/lib/db/repository";
import {
  activateChangeRequest,
  createChangeRequest,
  markChangeDeploying,
  reviewChangeRequest,
  scheduleChangeRequest,
  submitChangeRequest,
} from "@/lib/enterprise/change-workflow";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import {
  createControlPlaneResource,
  createMembership,
  createOrganization,
  findControlPlaneResource,
  getConfigVersionDetail,
} from "@/lib/enterprise/repository";
import type { EnterprisePrincipal } from "@/lib/enterprise/types";
import type { WorkflowRequestContext } from "@/lib/enterprise/change-workflow";
import { createProductDeployment } from "@/lib/deployment/repository";
import { approvedCollectionIdForProduct } from "@/lib/deployment/postman-collection-registry";

describe("commit meta normalization", () => {
  it("maps full Vercel github* meta", () => {
    const meta = normalizeVercelDeploymentMeta({
      githubCommitSha: "abcdef0123456789",
      githubCommitMessage: "feat: hello\n\nbody",
      githubCommitAuthorName: "Ada",
      githubCommitRef: "main",
      githubCommitOrg: "Acme",
      githubCommitRepo: "docs",
    });
    expect(meta?.githubCommitSha).toBe("abcdef0123456789");
    expect(meta?.githubCommitMessage).toBe("feat: hello\n\nbody");
    expect(githubCommitUrl(meta)).toContain("github.com/Acme/docs/commit/");
    expect(shortSha(meta?.githubCommitSha)).toBe("abcdef0");
    expect(firstLineMessage(meta?.githubCommitMessage)).toBe("feat: hello");
  });

  it("tolerates sparse CLI meta", () => {
    const meta = normalizeVercelDeploymentMeta({ githubCommitSha: "cli0001" });
    expect(meta?.githubCommitSha).toBe("cli0001");
    expect(meta?.githubCommitMessage).toBeUndefined();
    expect(githubCommitUrl(meta)).toBeNull();
    expect(firstLineMessage(undefined)).toBe("—");
  });

  it("returns undefined for empty meta", () => {
    expect(normalizeVercelDeploymentMeta({})).toBeUndefined();
    expect(normalizeVercelDeploymentMeta(null)).toBeUndefined();
  });

  it("exposes list limit constant of 25", () => {
    expect(VERCEL_DEPLOYMENT_LIST_LIMIT).toBe(25);
  });
});

describe("fake vercel commit meta", () => {
  it("seeds rich meta and non-READY rows", async () => {
    const provider = createFakeVercelProvider();
    const list = await provider.listDeployments("prj_ctix");
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list[0]!.meta?.githubCommitMessage).toBeTruthy();
    expect(list.some((d) => d.state === "BUILDING")).toBe(true);
    expect(list.some((d) => d.meta && !d.meta.githubCommitMessage)).toBe(true);
  });
});

describe("promote_commit change requests", () => {
  let dbDir: string;
  let organizationId: string;
  let ownerId: string;
  let developerId: string;
  let deploymentId: string;
  let prevKey: string | undefined;

  function ownerCtx(): WorkflowRequestContext {
    return {
      principal: {
        userId: ownerId,
        organizationId,
        role: "owner",
        status: "active",
      },
      correlationId: "corr-owner",
    };
  }

  function developerCtx(): WorkflowRequestContext {
    return {
      principal: {
        userId: developerId,
        organizationId,
        role: "developer",
        status: "active",
      },
      correlationId: "corr-dev",
    };
  }

  beforeEach(async () => {
    prevKey = process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
    process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(
      32,
      3
    ).toString("base64");
    dbDir = mkdtempSync(path.join(tmpdir(), "commit-switch-"));
    setTestDatabasePath(path.join(dbDir, "test.sqlite"));
    resetDatabaseConnection();

    const org = await createOrganization({
      name: "Commit Org",
      slug: `commit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
    organizationId = org.id;
    const owner = await createUserFromInvite({
      auth0UserId: "auth0|owner-commit",
      email: "owner-commit@example.com",
      name: "Owner",
      role: "owner",
    });
    ownerId = owner.id;
    const developer = await createUserFromInvite({
      auth0UserId: "auth0|dev-commit",
      email: "dev-commit@example.com",
      name: "Dev",
      role: "developer",
    });
    developerId = developer.id;
    await createMembership({
      organizationId,
      userId: ownerId,
      role: "owner",
    });
    await createMembership({
      organizationId,
      userId: developerId,
      role: "developer",
    });

    const deployment = await createProductDeployment({
      organizationId,
      userId: ownerId,
      config: {
        product: "ctix",
        postmanCollectionId: approvedCollectionIdForProduct("ctix"),
        vercelTeamId: "team",
        vercelProjectId: "prj_ctix",
        vercelProjectName: "cyware-docs-ctix",
        environment: "production",
        status: "ready",
      },
    });
    deploymentId = deployment.id;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    rmSync(dbDir, { recursive: true, force: true });
    if (prevKey === undefined) {
      delete process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY = prevKey;
    }
  });

  it("developer can propose production promote_commit via skipEnvironmentAuthorization", async () => {
    const developer: EnterprisePrincipal = {
      userId: developerId,
      organizationId,
      role: "developer",
      status: "active",
    };
    expect(
      authorizeEnterprise(developer, "changes.create", {
        organizationId,
        environment: "production",
      })
    ).toBe(false);
    expect(
      authorizeEnterprise(developer, "changes.create", { organizationId })
    ).toBe(true);

    const proposed = await proposeCommitSwitch(developerCtx(), {
      deploymentId,
      vercelDeploymentId: "dpl_prev",
      commitSha: "def456",
      fromCommitSha: "abc123",
      idempotencyKey: `idem-${Date.now()}`,
    });
    expect(proposed.changeRequest.state).toBe("PENDING_REVIEW");

    const detail = await getConfigVersionDetail(
      organizationId,
      proposed.changeRequest.targetConfigVersionId
    );
    expect(isPromoteCommitConfig(detail?.config ?? null)).toBe(true);
    expect(detail?.config?.action).toBe(PROMOTE_COMMIT_ACTION);
  });

  it("execute without approval fails; after approve assert succeeds", async () => {
    const proposed = await proposeCommitSwitch(developerCtx(), {
      deploymentId,
      vercelDeploymentId: "dpl_prev",
      commitSha: "def456",
      idempotencyKey: `idem-exec-${Date.now()}`,
    });

    await expect(
      assertApprovedCommitSwitch({
        organizationId,
        principal: ownerCtx().principal,
        changeRequestId: proposed.changeRequest.id,
        deploymentId,
        vercelDeploymentId: "dpl_prev",
        commitSha: "def456",
      })
    ).rejects.toMatchObject({ code: "NOT_APPROVED" });

    const approved = await reviewChangeRequest(ownerCtx(), {
      id: proposed.changeRequest.id,
      expectedVersion: proposed.changeRequest.version,
      decision: "APPROVED",
    });
    expect(approved.state).toBe("APPROVED");

    const asserted = await assertApprovedCommitSwitch({
      organizationId,
      principal: ownerCtx().principal,
      changeRequestId: approved.id,
      deploymentId,
      vercelDeploymentId: "dpl_prev",
      commitSha: "def456",
    });
    expect(asserted.state).toBe("APPROVED");
  });

  it("payload mismatch rejects execute", async () => {
    const proposed = await proposeCommitSwitch(developerCtx(), {
      deploymentId,
      vercelDeploymentId: "dpl_prev",
      commitSha: "def456",
      idempotencyKey: `idem-mm-${Date.now()}`,
    });
    await reviewChangeRequest(ownerCtx(), {
      id: proposed.changeRequest.id,
      expectedVersion: proposed.changeRequest.version,
      decision: "APPROVED",
    });
    await expect(
      assertApprovedCommitSwitch({
        organizationId,
        principal: ownerCtx().principal,
        changeRequestId: proposed.changeRequest.id,
        deploymentId,
        vercelDeploymentId: "dpl_OTHER",
        commitSha: "def456",
      })
    ).rejects.toMatchObject({ code: "PAYLOAD_MISMATCH" });
  });

  it("idempotent propose returns same change request", async () => {
    const key = `idem-same-${Date.now()}`;
    const first = await proposeCommitSwitch(developerCtx(), {
      deploymentId,
      vercelDeploymentId: "dpl_prev",
      commitSha: "def456",
      idempotencyKey: key,
    });
    const second = await proposeCommitSwitch(developerCtx(), {
      deploymentId,
      vercelDeploymentId: "dpl_prev",
      commitSha: "def456",
      idempotencyKey: key,
    });
    expect(second.changeRequest.id).toBe(first.changeRequest.id);
  });

  it("activateChangeRequest alone does not imply Vercel promote (config-only)", async () => {
    const promoteSpy = vi.fn();
    const proposed = await proposeCommitSwitch(developerCtx(), {
      deploymentId,
      vercelDeploymentId: "dpl_prev",
      commitSha: "def456",
      idempotencyKey: `idem-act-${Date.now()}`,
    });
    const approved = await reviewChangeRequest(ownerCtx(), {
      id: proposed.changeRequest.id,
      expectedVersion: proposed.changeRequest.version,
      decision: "APPROVED",
    });
    const resource = await findControlPlaneResource(
      organizationId,
      approved.resourceId
    );
    const deploying = await markChangeDeploying(
      ownerCtx(),
      approved.id,
      approved.version
    );
    await activateChangeRequest(ownerCtx(), {
      id: deploying.id,
      expectedVersion: deploying.version,
      expectedResourceVersion: resource!.version,
    });
    expect(promoteSpy).not.toHaveBeenCalled();
    const row = await db.queryOne<{ state: string }>(
      `SELECT state FROM change_requests WHERE id = ?`,
      [approved.id]
    );
    expect(row?.state).toBe("ACTIVE");
  });

  it("schedule of promote_commit config is detectable for route guards", async () => {
    const resource = await createControlPlaneResource({
      organizationId,
      resourceType: "product_deployment",
      name: "ctix-staging",
      environment: "staging",
      createdByUserId: ownerId,
    });
    const draft = await createChangeRequest(developerCtx(), {
      resourceId: resource.id,
      config: {
        action: PROMOTE_COMMIT_ACTION,
        deploymentId,
        vercelDeploymentId: "dpl_x",
        commitSha: "aaa",
      },
      diff: { operation: PROMOTE_COMMIT_ACTION },
      idempotencyKey: `sched-${Date.now()}`,
      skipEnvironmentAuthorization: true,
    });
    const pending = await submitChangeRequest(
      developerCtx(),
      draft.id,
      draft.version
    );
    const approved = await reviewChangeRequest(ownerCtx(), {
      id: pending.id,
      expectedVersion: pending.version,
      decision: "APPROVED",
    });
    const detail = await getConfigVersionDetail(
      organizationId,
      approved.targetConfigVersionId
    );
    expect(isPromoteCommitConfig(detail?.config ?? null)).toBe(true);

    const scheduled = await scheduleChangeRequest(ownerCtx(), {
      id: approved.id,
      expectedVersion: approved.version,
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(scheduled.state).toBe("SCHEDULED");
  });
});
