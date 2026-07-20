import "server-only";

import {
  VercelProviderError,
  type VercelDeploymentSummary,
  type VercelDomainStatus,
  type VercelDnsRequirement,
  type VercelDomainSummary,
  type VercelProvider,
} from "@/lib/deployment/providers/types";

const BASE = "https://api.vercel.com";
const TIMEOUT_MS = 15_000;

function getToken(): string {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) throw new VercelProviderError("Vercel token not configured", "NOT_CONFIGURED");
  return token;
}

function getTeamId(): string | undefined {
  return process.env.VERCEL_TEAM_ID?.trim() || undefined;
}

function teamQuery(): string {
  const teamId = getTeamId();
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

async function vercelFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 429) {
      throw new VercelProviderError("Vercel rate limit exceeded", "RATE_LIMIT", 429);
    }
    if (!res.ok) {
      throw new VercelProviderError(
        "Vercel request failed",
        res.status === 404 ? "NOT_FOUND" : "PROVIDER_ERROR",
        res.status
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof VercelProviderError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new VercelProviderError("Vercel request timed out", "TIMEOUT");
    }
    throw new VercelProviderError("Vercel provider unavailable", "UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

function mapDomain(raw: Record<string, unknown>): VercelDomainStatus {
  const verification = Array.isArray(raw.verification)
    ? (raw.verification as { type: string; domain: string; value: string }[])
    : undefined;
  return {
    name: String(raw.name ?? ""),
    verified: Boolean(raw.verified),
    configured: Boolean(raw.configured ?? raw.verified),
    misconfigured: Boolean(raw.misconfigured),
    verification,
    ssl: raw.ssl as VercelDomainStatus["ssl"],
  };
}

export function createHttpVercelProvider(allowedTeamId?: string): VercelProvider {
  const teamId = allowedTeamId ?? getTeamId();
  if (teamId && getTeamId() && teamId !== getTeamId()) {
    throw new VercelProviderError("Project team not allowlisted", "TEAM_NOT_ALLOWED");
  }

  return {
    async listProjects() {
      const data = await vercelFetch<{ projects: Record<string, unknown>[] }>(
        `/v9/projects${teamQuery()}`
      );
      return (data.projects ?? []).map((p) => ({
        id: String(p.id),
        name: String(p.name),
        accountId: p.accountId == null ? undefined : String(p.accountId),
      }));
    },

    async getProject(projectId) {
      try {
        const p = await vercelFetch<Record<string, unknown>>(
          `/v9/projects/${encodeURIComponent(projectId)}${teamQuery()}`
        );
        return { id: String(p.id), name: String(p.name) };
      } catch (err) {
        if (err instanceof VercelProviderError && err.code === "NOT_FOUND") return null;
        throw err;
      }
    },

    async listDomains(projectId) {
      const data = await vercelFetch<{ domains: Record<string, unknown>[] }>(
        `/v9/projects/${encodeURIComponent(projectId)}/domains${teamQuery()}`
      );
      return (data.domains ?? []).map(
        (d): VercelDomainSummary => ({
          name: String(d.name),
          verified: Boolean(d.verified),
          configured: Boolean(d.configured ?? d.verified),
        })
      );
    },

    async addDomain(projectId, domain) {
      const data = await vercelFetch<Record<string, unknown>>(
        `/v10/projects/${encodeURIComponent(projectId)}/domains${teamQuery()}`,
        { method: "POST", body: JSON.stringify({ name: domain }) }
      );
      return mapDomain(data);
    },

    async getDomainStatus(projectId, domain) {
      const data = await vercelFetch<Record<string, unknown>>(
        `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}${teamQuery()}`
      );
      return mapDomain(data);
    },

    async verifyDomain(projectId, domain) {
      await vercelFetch(
        `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}/verify${teamQuery()}`,
        { method: "POST" }
      );
      return this.getDomainStatus(projectId, domain);
    },

    async getRequiredDnsRecords(projectId, domain) {
      const status = await this.getDomainStatus(projectId, domain);
      return (status.verification ?? []).map(
        (v): VercelDnsRequirement => ({
          type: v.type,
          domain: v.domain,
          value: v.value,
        })
      );
    },

    async removeDomain(projectId, domain) {
      await vercelFetch(
        `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}${teamQuery()}`,
        { method: "DELETE" }
      );
    },

    async listDeployments(projectId) {
      const data = await vercelFetch<{ deployments: Record<string, unknown>[] }>(
        `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=10${teamQuery() ? `&teamId=${encodeURIComponent(getTeamId()!)}` : ""}`
      );
      return (data.deployments ?? []).map(
        (d): VercelDeploymentSummary => ({
          id: String(d.uid ?? d.id),
          url: String(d.url ?? ""),
          state: String(d.state ?? d.readyState ?? "unknown"),
          createdAt: String(d.createdAt ?? d.created ?? ""),
          meta: d.meta as VercelDeploymentSummary["meta"],
        })
      );
    },

    async promoteDeployment(deploymentId) {
      const data = await vercelFetch<Record<string, unknown>>(
        `/v13/deployments/${encodeURIComponent(deploymentId)}/promote${teamQuery()}`,
        { method: "POST" }
      );
      return {
        id: String(data.uid ?? data.id ?? deploymentId),
        url: String(data.url ?? ""),
        state: String(data.state ?? data.readyState ?? "READY"),
        createdAt: String(data.createdAt ?? data.created ?? ""),
        meta: data.meta as VercelDeploymentSummary["meta"],
      };
    },

    async rollbackDeployment(projectId) {
      const deployments = await this.listDeployments(projectId);
      const previous = deployments.find((d) => d.state === "READY") ?? deployments[1];
      if (!previous) {
        throw new VercelProviderError("No prior deployment to rollback", "NOT_FOUND", 404);
      }
      return this.promoteDeployment(previous.id);
    },
  };
}

export function isVercelProviderConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN?.trim());
}
