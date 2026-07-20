import { guardAgentFeature } from "@/lib/documentation-auth/guard-api";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { requireMutationCsrf } from "@/lib/enterprise/http";

export const runtime = "nodejs";
export const maxDuration = 60;

interface PullRequest {
  deploymentUrl: string;
  vercelToken: string;
}

interface VercelFileNode {
  name: string;
  type: "file" | "directory" | "lambda" | "middleware" | "framework" | "symlink" | "invalid";
  uid?: string;
  content?: string;
  children?: VercelFileNode[];
}

interface VercelDeployment {
  id: string;
  name?: string;
  url?: string;
  ownerId?: string;
  team?: { id?: string; slug?: string };
}

function hostFromUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http")) {
    return new URL(trimmed).hostname;
  }
  return trimmed.replace(/^https?:\/\//, "").split("/")[0] ?? trimmed;
}

function teamIdFromDeployment(deployment: VercelDeployment): string | undefined {
  if (deployment.team?.id) return deployment.team.id;
  if (deployment.ownerId?.startsWith("team_")) return deployment.ownerId;
  return undefined;
}

function withTeamQuery(path: string, teamId?: string): string {
  if (!teamId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}teamId=${encodeURIComponent(teamId)}`;
}

async function vercelFetch(path: string, token: string) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const err = data as { error?: { message?: string; code?: string }; message?: string };
    throw new Error(
      err.error?.message ?? err.message ?? `Vercel API error (${res.status})`
    );
  }
  return data;
}

function decodeFilePayload(data: unknown): string {
  const payload = data as { data?: string | number[] };
  if (typeof payload.data === "string") {
    // Vercel returns base64 for v8 file contents
    try {
      return Buffer.from(payload.data, "base64").toString("utf-8");
    } catch {
      return payload.data;
    }
  }
  if (Array.isArray(payload.data)) {
    return Buffer.from(payload.data).toString("utf-8");
  }
  return "";
}

/** Try multiple Vercel file-content APIs (teamId + uid + optional path for Git deploys). */
async function fetchFileContent(
  deploymentId: string,
  filePath: string,
  uid: string | undefined,
  token: string,
  teamId?: string
): Promise<string> {
  const attempts: string[] = [];

  if (uid) {
    // Primary: deployment file by uid (agent uploads use team_XXX-hash ids)
    attempts.push(
      withTeamQuery(
        `/v8/deployments/${encodeURIComponent(deploymentId)}/files/${encodeURIComponent(uid)}`,
        teamId
      )
    );
    // Git deployments may require path alongside fileId
    attempts.push(
      withTeamQuery(
        `/v8/deployments/${encodeURIComponent(deploymentId)}/files/${encodeURIComponent(uid)}?path=${encodeURIComponent(filePath)}`,
        teamId
      )
    );
    // Legacy v2 blob store
    attempts.push(withTeamQuery(`/v2/files/${encodeURIComponent(uid)}`, teamId));
  }

  let lastError = "Could not read file";
  for (const path of attempts) {
    try {
      const data = await vercelFetch(path, token);
      const text = decodeFilePayload(data);
      if (text) return text;
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }

  throw new Error(`${lastError} (${filePath})`);
}

async function collectFiles(
  nodes: VercelFileNode[],
  prefix: string,
  deploymentId: string,
  token: string,
  teamId: string | undefined,
  out: { path: string; code: string }[],
  errors: string[]
) {
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "directory" && node.children?.length) {
      await collectFiles(node.children, path, deploymentId, token, teamId, out, errors);
    } else if (node.type === "file" || node.type === "lambda") {
      if (node.content) {
        out.push({ path, code: node.content });
        continue;
      }
      try {
        const code = await fetchFileContent(deploymentId, path, node.uid, token, teamId);
        if (code) out.push({ path, code });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `${path}: fetch failed`);
      }
    }
  }
}

const SOURCE_EXT =
  /\.(tsx?|jsx?|json|css|md|mjs|cjs|env\.example)$|^(package\.json|tsconfig\.json|next\.config\.(ts|js|mjs))$/;

export async function POST(req: Request) {
  const session = await guardAgentFeature(
    req as import("next/server").NextRequest,
    "vercel_import"
  );
  if (session instanceof Response) return session;

  if (isAuthEnabled()) {
    const csrfFailure = requireMutationCsrf(req as import("next/server").NextRequest);
    if (csrfFailure) return csrfFailure;
  }

  try {
    const { deploymentUrl, vercelToken } = (await req.json()) as PullRequest;
    if (!deploymentUrl?.trim()) {
      return Response.json({ error: "Deployment URL is required" }, { status: 400 });
    }
    if (!vercelToken?.trim()) {
      return Response.json({ error: "Vercel token is required" }, { status: 400 });
    }

    const host = hostFromUrl(deploymentUrl);

    const deployment = (await vercelFetch(
      withTeamQuery(`/v13/deployments/${encodeURIComponent(host)}`, undefined),
      vercelToken
    )) as VercelDeployment;

    if (!deployment?.id) {
      return Response.json({ error: `No deployment found for ${host}` }, { status: 404 });
    }

    const teamId = teamIdFromDeployment(deployment);

    let tree: VercelFileNode[];
    try {
      tree = (await vercelFetch(
        withTeamQuery(`/v6/deployments/${encodeURIComponent(deployment.id)}/files`, teamId),
        vercelToken
      )) as VercelFileNode[];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not list deployment files";
      return Response.json(
        {
          error:
            `${message}. Deployments from GitHub often cannot expose source files via API. ` +
            "If you built the app in this browser, select it from the Project dropdown instead.",
        },
        { status: 404 }
      );
    }

    const allFiles: { path: string; code: string }[] = [];
    const fetchErrors: string[] = [];
    await collectFiles(
      Array.isArray(tree) ? tree : [],
      "",
      deployment.id,
      vercelToken,
      teamId,
      allFiles,
      fetchErrors
    );

    // Vercel's deployment file tree wraps user source files in a top-level
    // "src/" directory (sibling of "out/", ".vercel/" etc.). Strip that wrapper
    // so package.json lands at the project root on redeploy.
    const normalized = allFiles
      .filter((f) => !f.path.startsWith("out/") && !f.path.startsWith(".vercel/"))
      .map((f) =>
        f.path.startsWith("src/") && allFiles.some((x) => x.path === "src/package.json")
          ? { ...f, path: f.path.slice(4) }
          : f
      );

    const files = normalized.filter(
      (f) =>
        !f.path.startsWith(".next/") &&
        !f.path.startsWith("node_modules/") &&
        SOURCE_EXT.test(f.path.split("/").pop() ?? f.path)
    );

    if (files.length === 0) {
      const detail = fetchErrors.slice(0, 2).join("; ");
      return Response.json(
        {
          error:
            "No source files could be imported from this deployment. " +
            (detail ? `Details: ${detail}. ` : "") +
            "Use the Project dropdown if you built the app here, or redeploy via the agent Deploy button.",
        },
        { status: 404 }
      );
    }

    const title =
      deployment.name?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ??
      "Imported App";

    // Prefer stable production alias over deployment-specific preview URLs
    const stableHost = host.includes("-") && host.endsWith(".vercel.app") && host.split("-").length > 3
      ? deployment.name
        ? `${deployment.name}.vercel.app`
        : host
      : host;

    return Response.json({
      title,
      vercelProjectName: deployment.name ?? host.split(".")[0],
      deploymentUrl: `https://${stableHost}`,
      deploymentId: deployment.id,
      files,
      warnings: fetchErrors.length > 0 ? fetchErrors.slice(0, 5) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to pull deployment";
    return Response.json({ error: message }, { status: 502 });
  }
}
