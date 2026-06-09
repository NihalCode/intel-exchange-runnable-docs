export const runtime = "nodejs";

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
}

function hostFromUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http")) {
    return new URL(trimmed).hostname;
  }
  return trimmed.replace(/^https?:\/\//, "").split("/")[0] ?? trimmed;
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

/** GET /v8/deployments/{id}/files/{fileId} — contents are base64-encoded in JSON. */
async function fileContent(
  deploymentId: string,
  fileId: string,
  token: string
): Promise<string> {
  const data = (await vercelFetch(
    `/v8/deployments/${encodeURIComponent(deploymentId)}/files/${encodeURIComponent(fileId)}`,
    token
  )) as { data?: string };
  if (!data.data) return "";
  return Buffer.from(data.data, "base64").toString("utf-8");
}

async function collectFiles(
  nodes: VercelFileNode[],
  prefix: string,
  deploymentId: string,
  token: string,
  out: { path: string; code: string }[]
) {
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "directory" && node.children?.length) {
      await collectFiles(node.children, path, deploymentId, token, out);
    } else if (node.type === "file" || node.type === "lambda") {
      if (node.content) {
        out.push({ path, code: node.content });
      } else if (node.uid) {
        const code = await fileContent(deploymentId, node.uid, token);
        if (code) out.push({ path, code });
      }
    }
  }
}

const SOURCE_EXT =
  /\.(tsx?|jsx?|json|css|md|mjs|cjs|env\.example)$|^(package\.json|tsconfig\.json|next\.config\.(ts|js|mjs))$/;

export async function POST(req: Request) {
  try {
    const { deploymentUrl, vercelToken } = (await req.json()) as PullRequest;
    if (!deploymentUrl?.trim()) {
      return Response.json({ error: "Deployment URL is required" }, { status: 400 });
    }
    if (!vercelToken?.trim()) {
      return Response.json({ error: "Vercel token is required" }, { status: 400 });
    }

    const host = hostFromUrl(deploymentUrl);

    // Correct API: GET /v13/deployments/{idOrUrl} — hostname works as idOrUrl
    // (Do NOT use ?host= on list deployments — that returns "Invalid API version")
    const deployment = (await vercelFetch(
      `/v13/deployments/${encodeURIComponent(host)}`,
      vercelToken
    )) as VercelDeployment;

    if (!deployment?.id) {
      return Response.json({ error: `No deployment found for ${host}` }, { status: 404 });
    }

    let tree: VercelFileNode[];
    try {
      tree = (await vercelFetch(
        `/v6/deployments/${encodeURIComponent(deployment.id)}/files`,
        vercelToken
      )) as VercelFileNode[];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not list deployment files";
      return Response.json(
        {
          error:
            `${message}. This deployment may have been created from Git without uploaded source files. ` +
            "If you deployed via the agent's Deploy button, try selecting the app from the Project dropdown instead.",
        },
        { status: 404 }
      );
    }

    const allFiles: { path: string; code: string }[] = [];
    await collectFiles(Array.isArray(tree) ? tree : [], "", deployment.id, vercelToken, allFiles);

    const files = allFiles.filter(
      (f) =>
        !f.path.startsWith(".next/") &&
        !f.path.startsWith("node_modules/") &&
        SOURCE_EXT.test(f.path.split("/").pop() ?? f.path)
    );

    if (files.length === 0) {
      return Response.json(
        {
          error:
            "No source files found in this deployment. Apps deployed from GitHub may not expose source via API — " +
            "use the Project dropdown if you built the app in this browser, or redeploy using the agent's Deploy button.",
        },
        { status: 404 }
      );
    }

    const title =
      deployment.name?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ??
      "Imported App";

    return Response.json({
      title,
      vercelProjectName: deployment.name ?? host.split(".")[0],
      deploymentUrl: deploymentUrl.startsWith("http") ? deploymentUrl : `https://${host}`,
      deploymentId: deployment.id,
      files,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to pull deployment";
    return Response.json({ error: message }, { status: 502 });
  }
}
