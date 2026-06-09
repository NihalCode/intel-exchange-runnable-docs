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
