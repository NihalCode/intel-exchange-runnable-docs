import "server-only";

import {
  findLatestPromoteAuditSha,
  listPendingCommitSwitches,
  type PendingCommitSwitchLink,
} from "@/lib/deployment/commit-change-requests";
import {
  firstLineMessage,
  githubCommitUrl,
  shortSha,
} from "@/lib/deployment/commit-meta";
import { getVercelProvider } from "@/lib/deployment/providers";
import type { VercelDeploymentGitMeta } from "@/lib/deployment/providers/types";
import {
  listProductDeployments,
  maskProjectId,
} from "@/lib/deployment/repository";
import type {
  DeploymentEnvironment,
  ProductDeploymentConfiguration,
} from "@/lib/deployment/types";

export interface CommitHistoryRow {
  vercelDeploymentId: string;
  url: string;
  state: string;
  createdAt: string;
  meta: VercelDeploymentGitMeta | undefined;
  shortSha: string;
  message: string;
  author: string;
  ref: string;
  githubUrl: string | null;
  switchable: boolean;
  likelyCurrent: boolean;
  pendingChangeRequestId: string | null;
  pendingChangeState: string | null;
}

export interface ProductCommitHistory {
  deploymentId: string;
  product: string;
  environment: DeploymentEnvironment;
  vercelProjectName: string;
  vercelProjectIdMasked: string;
  status: string;
  error: string | null;
  commits: CommitHistoryRow[];
}

function matchPending(
  pending: PendingCommitSwitchLink[],
  vercelDeploymentId: string
): PendingCommitSwitchLink | undefined {
  return pending.find((p) => p.vercelDeploymentId === vercelDeploymentId);
}

export async function listCommitHistories(input: {
  organizationId: string;
  environment?: DeploymentEnvironment | null;
}): Promise<ProductCommitHistory[]> {
  const deployments = await listProductDeployments(input.organizationId);
  const filtered = input.environment
    ? deployments.filter((d) => d.environment === input.environment)
    : deployments;

  const pendingAll = await listPendingCommitSwitches(input.organizationId);
  const provider = getVercelProvider();

  return Promise.all(
    filtered.map(async (deployment) =>
      loadProductCommits(deployment, pendingAll, provider)
    )
  );
}

async function loadProductCommits(
  deployment: ProductDeploymentConfiguration,
  pendingAll: PendingCommitSwitchLink[],
  provider: ReturnType<typeof getVercelProvider>
): Promise<ProductCommitHistory> {
  const pending = pendingAll.filter((p) => p.deploymentId === deployment.id);
  const auditSha = await findLatestPromoteAuditSha(
    deployment.organizationId,
    deployment.id
  );

  try {
    const listed = await provider.listDeployments(deployment.vercelProjectId);
    const ready = listed.filter((d) => d.state.toUpperCase() === "READY");
    const currentId =
      (auditSha
        ? ready.find((d) => d.meta?.githubCommitSha === auditSha)?.id
        : undefined) ?? ready[0]?.id;

    const commits: CommitHistoryRow[] = listed.map((dep) => {
      const meta = dep.meta;
      const pendingHit = matchPending(pending, dep.id);
      const isReady = dep.state.toUpperCase() === "READY";
      const likelyCurrent = currentId === dep.id;
      return {
        vercelDeploymentId: dep.id,
        url: dep.url,
        state: dep.state,
        createdAt: dep.createdAt,
        meta,
        shortSha: shortSha(meta?.githubCommitSha, dep.id.slice(0, 8)),
        message: firstLineMessage(meta?.githubCommitMessage),
        author: meta?.githubCommitAuthorName?.trim() || "—",
        ref: meta?.githubCommitRef?.trim() || "—",
        githubUrl: githubCommitUrl(meta),
        switchable: isReady && !likelyCurrent,
        likelyCurrent,
        pendingChangeRequestId: pendingHit?.changeRequestId ?? null,
        pendingChangeState: pendingHit?.changeState ?? null,
      };
    });

    return {
      deploymentId: deployment.id,
      product: deployment.product,
      environment: deployment.environment,
      vercelProjectName: deployment.vercelProjectName,
      vercelProjectIdMasked: maskProjectId(deployment.vercelProjectId),
      status: deployment.status,
      error: null,
      commits,
    };
  } catch (error) {
    return {
      deploymentId: deployment.id,
      product: deployment.product,
      environment: deployment.environment,
      vercelProjectName: deployment.vercelProjectName,
      vercelProjectIdMasked: maskProjectId(deployment.vercelProjectId),
      status: deployment.status,
      error: error instanceof Error ? error.message : "Failed to list deployments",
      commits: [],
    };
  }
}
