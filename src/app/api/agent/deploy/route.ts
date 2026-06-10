import { formatProblems, validateAppFiles } from "@/lib/agent/validate-app";
import { repairAppFiles } from "@/lib/agent/repair-app";

export const runtime = "nodejs";
export const maxDuration = 60;

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

/**
 * Apps imported from Vercel before the import fix have paths wrapped in "src/"
 * (Vercel's deployment file tree nests sources there). npm then can't find
 * package.json at the deployment root. Strip the wrapper if package.json
 * is missing at root but present under a single common directory.
 */
function normalizeFilePaths(
  files: { path: string; code: string }[]
): { path: string; code: string }[] {
  const hasRootPkg = files.some((f) => f.path === "package.json");
  if (hasRootPkg) return files;

  const wrapped = files.find((f) => /^[^/]+\/package\.json$/.test(f.path));
  if (!wrapped) return files;

  const prefix = wrapped.path.slice(0, -"package.json".length); // e.g. "src/"
  if (!files.every((f) => f.path.startsWith(prefix))) return files;

  return files.map((f) => ({ ...f, path: f.path.slice(prefix.length) }));
}

/** Fix known-bad dependency pins in apps saved before the eslint fix. */
function fixPackageJson(code: string): string {
  try {
    const pkg = JSON.parse(code) as {
      devDependencies?: Record<string, string>;
    };
    const dev = pkg.devDependencies;
    if (dev) {
      // eslint 9 is incompatible with eslint-config-next 15.x peer requirements
      if (dev.eslint?.startsWith("^9")) dev.eslint = "^8";
      if (dev["eslint-config-next"] === "15.1.6") dev["eslint-config-next"] = "^15.2.0";
    }
    return JSON.stringify(pkg, null, 2);
  } catch {
    return code;
  }
}

/**
 * Generated/edited apps must deploy reliably even if an LLM edit introduced a
 * lint warning or a minor type issue — skip blocking checks at build time.
 */
function hardenNextConfig(code: string): string {
  if (code.includes("ignoreBuildErrors")) return code;
  const anchor = code.match(/const nextConfig(?::\s*NextConfig)?\s*=\s*\{/);
  if (!anchor) return code;
  return code.replace(
    anchor[0],
    `${anchor[0]}\n  eslint: { ignoreDuringBuilds: true },\n  typescript: { ignoreBuildErrors: true },`
  );
}

function hardenFiles(
  files: { path: string; code: string }[]
): { path: string; code: string }[] {
  return files.map((f) => {
    if (f.path === "package.json") return { ...f, code: fixPackageJson(f.code) };
    if (/^next\.config\.(ts|js|mjs)$/.test(f.path)) return { ...f, code: hardenNextConfig(f.code) };
    return f;
  });
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

    const normalizedFiles = hardenFiles(normalizeFilePaths(files));
    const { files: repairedFiles, notes: repairNotes } = repairAppFiles(normalizedFiles);

    if (!repairedFiles.some((f) => f.path === "package.json")) {
      return Response.json(
        {
          error:
            "package.json is missing from the app files, so the Vercel build would fail. " +
            "Re-import the app from Vercel (the import now fixes file paths) or rebuild it via the agent.",
        },
        { status: 400 }
      );
    }

    // Catch broken source before uploading — a failed Vercel build wastes
    // minutes and surfaces a log the agent can't see.
    const problems = validateAppFiles(repairedFiles);
    if (problems.length > 0) {
      return Response.json(
        {
          error:
            `Deploy blocked: the app has syntax errors that would fail the Vercel build — ${formatProblems(problems)}. ` +
            "Ask the agent to fix the broken file, or rebuild the app fresh.",
        },
        { status: 400 }
      );
    }

    const payload = {
      name,
      files: repairedFiles.map((f) => ({
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
      warnings: repairNotes.length > 0 ? repairNotes : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deployment failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
