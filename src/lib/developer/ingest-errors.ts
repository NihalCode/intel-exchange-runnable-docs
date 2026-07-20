/** Map ingest stderr/stdout to a user-facing message (never echo raw process output). */
export function formatIngestFailure(payload: {
  stderr?: string;
  stdout?: string;
  productId?: string;
}): { error: string; detail: string } {
  const stderr = payload.stderr ?? "";
  const stdout = payload.stdout ?? "";
  const combined = `${stderr}\n${stdout}`;

  if (/HTTP 403/.test(combined)) {
    return {
      error: "Upstream documentation server returned HTTP 403 (Forbidden).",
      detail:
        "Cyware/Theneo doc hosts often block automated requests from cloud servers (including Vercel). " +
        "For CTIX/CSAP/Orchestrate: use **Import Postman collection** below (export Collection v2.1 JSON from Postman), " +
        "or run ingest locally: `npm run ingest -- --product=" +
        (payload.productId ?? "ctix") +
        "` then commit the updated files. " +
        "CFTR **Sync from source** usually works on Vercel because it uses the public Postman API URL.",
    };
  }

  if (/ERR_MODULE_NOT_FOUND/.test(combined)) {
    return {
      error: "Ingest script missing on server.",
      detail: "Contact an administrator — deployment may be missing scripts/ bundle.",
    };
  }

  if (/EROFS|read-only/i.test(combined)) {
    return {
      error: "Cannot write documentation files on this server.",
      detail:
        "On Vercel, ingest output is written to /tmp only. Use local ingest + git commit to publish doc updates.",
    };
  }

  if (combined.trim()) {
    console.error(
      "[ingest] failure output redacted from client response",
      combined.slice(-2000)
    );
  }

  return {
    error: "Ingestion failed.",
    detail:
      "The ingest process exited with an error. Check server logs for details, or run ingest locally.",
  };
}
