export const runtime = "nodejs";

interface PullRequest {
  deploymentUrl: string;
  vercelToken: string;
}

interface VercelFileNode {
  name: string;
  type: "file" | "directory" | "lambda" | "middleware" | "framework";
  uid?: string;
  content?: string;
  children?: VercelFileNode[];
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
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      (data as { error?: { message?: string } }).error?.message ??
        `Vercel API error (${res.status})`
    );
  }
  return data;
}

async function fileContent(uid: string, token: string): Promise<string> {
  const data = (await vercelFetch(`/v2/files/${uid}`, token)) as { data?: string | number[] };
  if (typeof data.data === "string") return data.data;
  if (Array.isArray(data.data)) return Buffer.from(data.data).toString("utf-8");
  return "";
}

async function collectFiles(
  nodes: VercelFileNode[],
  prefix: string,
  token: string,
  out: { path: string; code: string }[]
) {
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "directory" && node.children?.length) {
      await collectFiles(node.children, path, token, out);
    } else if (node.type === "file" || node.type === "lambda") {
      if (node.content) {
        out.push({ path, code: node.content });
      } else if (node.uid) {
        const code = await fileContent(node.uid, token);
        out.push({ path, code });
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
    const deployments = (await vercelFetch(
      `/v13/deployments?host=${encodeURIComponent(host)}&limit=1`,
      vercelToken
    )) as { deployments?: { uid: string; url?: string; name?: string }[] };

    const deployment = deployments.deployments?.[0];
    if (!deployment?.uid) {
      return Response.json({ error: `No deployment found for ${host}` }, { status: 404 });
    }

    const tree = (await vercelFetch(
      `/v6/deployments/${deployment.uid}/files`,
      vercelToken
    )) as VercelFileNode[];

    const allFiles: { path: string; code: string }[] = [];
    await collectFiles(Array.isArray(tree) ? tree : [], "", vercelToken, allFiles);

    const files = allFiles.filter(
      (f) =>
        !f.path.startsWith(".next/") &&
        !f.path.startsWith("node_modules/") &&
        SOURCE_EXT.test(f.path.split("/").pop() ?? f.path)
    );

    if (files.length === 0) {
      return Response.json(
        { error: "No source files found in deployment. Try importing a saved app from this browser instead." },
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
      deploymentId: deployment.uid,
      files,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to pull deployment";
    return Response.json({ error: message }, { status: 502 });
  }
}
