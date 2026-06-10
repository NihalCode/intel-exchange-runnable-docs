export const runtime = "nodejs";

interface DeployRequest {
  files: { path: string; code: string }[];
  appName: string;
  vercelToken: string;
  projectName?: string;
  envVars?: Record<string, string>;
}

interface VercelDeployResponse {
  id?: string;
  url?: string;
  readyState?: string;
  inspectorUrl?: string;
  error?: { message?: string; code?: string };
}

async function vercelGet(path: string, token: string) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

/** Get the user's defaultTeamId so team-owned projects can be patched. */
async function getDefaultTeamId(token: string): Promise<string | undefined> {
  try {
    const data = await vercelGet("/v2/user", token);
    const tid = (data as { user?: { defaultTeamId?: string } } | null)?.user?.defaultTeamId;
    return tid ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Before deploying, clear any stale rootDirectory on the Vercel project.
 * rootDirectory is a project-level setting; it cannot be overridden in the
 * deployment payload. If set, Vercel runs npm install from the wrong subdirectory
 * causing "ENOENT: no such file or directory, open '/vercel/pathN/package.json'".
 *
 * We try with teamId (team-owned projects) and without (personal accounts).
 */
async function clearProjectRootDirectory(
  projectName: string,
  token: string
): Promise<void> {
  const teamId = await getDefaultTeamId(token);

  const candidateUrls = [
    teamId
      ? `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}?teamId=${encodeURIComponent(teamId)}`
      : null,
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}`,
  ].filter(Boolean) as string[];

  for (const url of candidateUrls) {
    try {
      const getRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!getRes.ok) continue;

      const project = (await getRes.json()) as { rootDirectory?: string | null };
      if (!project.rootDirectory) return; // already clear — nothing to do

      await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rootDirectory: "" }),
      });
      return; // patched successfully
    } catch {
      // try next candidate
    }
  }
}

export async function POST(req: Request) {
  try {
    const { files, appName, vercelToken, projectName, envVars } =
      (await req.json()) as DeployRequest;

    if (!vercelToken?.trim()) {
      return Response.json({ error: "Vercel token is required" }, { status: 400 });
    }
    if (!Array.isArray(files) || files.length === 0) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    const token = vercelToken.trim();

    const name =
      projectName?.trim() ||
      appName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 52);

    // Clear stale rootDirectory before deploying (with teamId for team accounts).
    await clearProjectRootDirectory(name, token);

    const payload = {
      name,
      files: files.map((f) => ({
        file: f.path,
        data: f.code,
      })),
      projectSettings: {
        framework: "nextjs",
        installCommand: "npm install --legacy-peer-deps",
        buildCommand: "npm run build",
        outputDirectory: ".next",
        nodeVersion: "20.x",
      },
      target: "production",
      env: envVars ?? {},
    };

    const res = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as VercelDeployResponse;

    if (!res.ok) {
      return Response.json(
        {
          error: data.error?.message ?? `Vercel API error (${res.status})`,
          code: data.error?.code,
        },
        { status: 502 }
      );
    }

    return Response.json({
      deploymentId: data.id,
      url: data.url ? `https://${data.url}` : null,
      readyState: data.readyState,
      inspectorUrl: data.inspectorUrl,
      projectName: name,
      message:
        `Deployment started for project "${name}". Your app will be live in ~2 minutes at the URL above. ` +
        "Redeploying with the same project name updates the existing site in place.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deployment failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
