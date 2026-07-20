import {
  VercelProviderError,
  type VercelDeploymentSummary,
  type VercelDomainStatus,
  type VercelDnsRequirement,
  type VercelDomainSummary,
  type VercelProjectSummary,
  type VercelProvider,
} from "@/lib/deployment/providers/types";

/** In-memory fake for CI — no live Vercel API calls. */
export function createFakeVercelProvider(seed?: {
  projects?: VercelProjectSummary[];
  domains?: Record<string, VercelDomainSummary[]>;
}): VercelProvider {
  const projects = seed?.projects ?? [
    { id: "prj_ctix", name: "cyware-docs-ctix" },
    { id: "prj_cftr", name: "cyware-docs-cftr" },
  ];
  const domainsByProject = new Map<string, Map<string, VercelDomainStatus>>();

  for (const [projectId, list] of Object.entries(seed?.domains ?? {})) {
    const map = new Map<string, VercelDomainStatus>();
    for (const d of list) {
      map.set(d.name, {
        name: d.name,
        verified: d.verified,
        configured: d.configured,
        misconfigured: !d.verified,
        verification: [{ type: "CNAME", domain: d.name, value: "cname.vercel-dns.com" }],
        ssl: { status: d.verified ? "active" : "pending" },
      });
    }
    domainsByProject.set(projectId, map);
  }

  return {
    async listProjects() {
      return projects;
    },
    async getProject(projectId) {
      return projects.find((p) => p.id === projectId) ?? null;
    },
    async listDomains(projectId) {
      const map = domainsByProject.get(projectId);
      if (!map) return [];
      return [...map.values()].map((d) => ({
        name: d.name,
        verified: d.verified,
        configured: d.configured,
      }));
    },
    async addDomain(projectId, domain) {
      const status: VercelDomainStatus = {
        name: domain,
        verified: false,
        configured: false,
        misconfigured: true,
        verification: [{ type: "CNAME", domain, value: "cname.vercel-dns.com" }],
        ssl: { status: "pending" },
      };
      if (!domainsByProject.has(projectId)) domainsByProject.set(projectId, new Map());
      domainsByProject.get(projectId)!.set(domain, status);
      return status;
    },
    async getDomainStatus(projectId, domain) {
      const status = domainsByProject.get(projectId)?.get(domain);
      if (!status) {
        throw new VercelProviderError("Domain not found", "NOT_FOUND", 404);
      }
      return status;
    },
    async verifyDomain(projectId, domain) {
      const status = await this.getDomainStatus(projectId, domain);
      status.verified = true;
      status.configured = true;
      status.misconfigured = false;
      status.ssl = { status: "active" };
      return status;
    },
    async getRequiredDnsRecords(_projectId, domain) {
      return [
        { type: "CNAME", domain, value: "cname.vercel-dns.com" },
      ] satisfies VercelDnsRequirement[];
    },
    async removeDomain(projectId, domain) {
      domainsByProject.get(projectId)?.delete(domain);
    },
    async listDeployments(projectId) {
      return [
        {
          id: `dpl_${projectId}_current`,
          url: `${projectId}.vercel.app`,
          state: "READY",
          createdAt: new Date().toISOString(),
          meta: { githubCommitSha: "abc123" },
        },
        {
          id: `dpl_${projectId}_previous`,
          url: `${projectId}-prev.vercel.app`,
          state: "READY",
          createdAt: new Date(Date.now() - 86_400_000).toISOString(),
          meta: { githubCommitSha: "def456" },
        },
      ] satisfies VercelDeploymentSummary[];
    },
    async promoteDeployment(deploymentId) {
      return {
        id: deploymentId,
        url: `${deploymentId}.vercel.app`,
        state: "READY",
        createdAt: new Date().toISOString(),
        meta: { githubCommitSha: "promoted" },
      };
    },
    async rollbackDeployment(projectId) {
      const deployments = await this.listDeployments(projectId);
      return this.promoteDeployment(deployments[1]?.id ?? deployments[0]!.id);
    },
  };
}
