/** Cyware env vars injected into deployed Vercel apps. */
export const CYWARE_ENV_KEYS = [
  "CYWARE_BASE_URL",
  "CYWARE_ACCESS_ID",
  "CYWARE_SECRET_KEY",
] as const;

export type CywareEnvKey = (typeof CYWARE_ENV_KEYS)[number];

export function validateCywareEnvVars(envVars?: Record<string, string>): string | null {
  if (!envVars) return "Cyware credentials are required (base URL, Access ID, Secret Key).";
  for (const key of CYWARE_ENV_KEYS) {
    if (!envVars[key]?.trim()) {
      return `${key} is required — fill in Cyware credentials in the deploy dialog.`;
    }
  }
  return null;
}

/** Payload for POST /v10/projects/{name}/env?upsert=true */
export function buildVercelEnvPayload(envVars: Record<string, string>) {
  const targets = ["production", "preview", "development"] as const;
  return CYWARE_ENV_KEYS.filter((key) => envVars[key]?.trim()).map((key) => ({
    key,
    value: envVars[key].trim(),
    type: key === "CYWARE_SECRET_KEY" ? ("sensitive" as const) : ("plain" as const),
    target: [...targets],
  }));
}

/**
 * Persist env vars on the Vercel project so serverless API routes can read
 * process.env at runtime (deployment-only env is not always enough).
 */
export async function syncProjectEnvVars(
  projectName: string,
  token: string,
  envVars: Record<string, string>,
  teamId?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload = buildVercelEnvPayload(envVars);
  if (payload.length === 0) {
    return { ok: false, error: "No Cyware environment variables to sync." };
  }

  const paths = teamId
    ? [`?upsert=true&teamId=${encodeURIComponent(teamId)}`, "?upsert=true"]
    : ["?upsert=true"];

  let lastError = "Failed to sync environment variables to Vercel project";

  for (const qs of paths) {
    try {
      const res = await fetch(
        `https://api.vercel.com/v10/projects/${encodeURIComponent(projectName)}/env${qs}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) return { ok: true };
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      lastError = data.error?.message ?? `Vercel env API error (${res.status})`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }

  return { ok: false, error: lastError };
}
