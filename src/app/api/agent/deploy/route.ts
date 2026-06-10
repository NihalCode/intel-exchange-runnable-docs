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

/**
 * If the project already exists and has a rootDirectory configured, clear it.
 * rootDirectory is a project-level setting that is NOT overridable in the
 * deployment payload's projectSettings — it must be patched via the Projects API.
 * A stale rootDirectory causes Vercel to look for package.json in a subdirectory
 * that doesn't exist in our flat file upload, producing "ENOENT package.json".
 */
async function clearProjectRootDirectory(
  projectName: string,
  token: string
): Promise<void> {
  try {
    const getRes = await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!getRes.ok) return; // Project doesn't exist yet — nothing to patch

    const project = (await getRes.json()) as { rootDirectory?: string | null };
    if (!project.rootDirectory) return; // Already clear

    await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rootDirectory: "" }),
      }
    );
  } catch {
    // Non-fatal: if the patch fails we still attempt the deployment.
  }
}

export async function POST(req: Request) {
  try {
    const { files, appName, vercelToken, projectName, envVars } = (await req.json()) as DeployRequest;

    if (!vercelToken?.trim()) {
      return Response.json({ error: "Vercel token is required" }, { status: 400 });
    }
    if (!Array.isArray(files) || files.length === 0) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    const name =
      projectName?.trim() ||
      appName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 52);

    // Clear stale rootDirectory before deploying so package.json is found at root.
    await clearProjectRootDirectory(name, vercelToken.trim());

    const payload = {
      name,
      files: files.map((f) => ({
        file: f.path,
        data: f.code,
        encoding: "utf-8",
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
        Authorization: `Bearer ${vercelToken.trim()}`,
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
