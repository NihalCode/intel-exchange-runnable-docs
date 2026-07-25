import type { VercelDeploymentGitMeta } from "@/lib/deployment/providers/types";

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Normalize Vercel deployment.meta (and overlapping git fields) into typed GitHub commit meta.
 * Tolerates sparse CLI deploys that omit message/author/repo.
 */
export function normalizeVercelDeploymentMeta(
  raw: unknown
): VercelDeploymentGitMeta | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const meta = raw as Record<string, unknown>;
  const normalized: VercelDeploymentGitMeta = {
    githubCommitSha: asOptionalString(
      meta.githubCommitSha ?? meta.commitSha ?? meta.githubCommitSha
    ),
    githubCommitMessage: asOptionalString(
      meta.githubCommitMessage ?? meta.commitMessage
    ),
    githubCommitAuthorName: asOptionalString(
      meta.githubCommitAuthorName ?? meta.commitAuthorName
    ),
    githubCommitRef: asOptionalString(
      meta.githubCommitRef ?? meta.commitRef
    ),
    githubCommitOrg: asOptionalString(
      meta.githubCommitOrg ?? meta.githubOrg
    ),
    githubCommitRepo: asOptionalString(
      meta.githubCommitRepo ?? meta.githubRepo
    ),
  };
  if (
    !normalized.githubCommitSha &&
    !normalized.githubCommitMessage &&
    !normalized.githubCommitAuthorName &&
    !normalized.githubCommitRef &&
    !normalized.githubCommitOrg &&
    !normalized.githubCommitRepo
  ) {
    return undefined;
  }
  return normalized;
}

export function githubCommitUrl(meta: VercelDeploymentGitMeta | undefined): string | null {
  const sha = meta?.githubCommitSha;
  const org = meta?.githubCommitOrg;
  const repo = meta?.githubCommitRepo;
  if (!sha || !org || !repo) return null;
  return `https://github.com/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/commit/${encodeURIComponent(sha)}`;
}

export function shortSha(sha: string | undefined | null, fallback = "—"): string {
  if (!sha?.trim()) return fallback;
  return sha.trim().slice(0, 7);
}

export function firstLineMessage(message: string | undefined | null): string {
  if (!message?.trim()) return "—";
  return message.trim().split(/\r?\n/)[0]!.slice(0, 160);
}
