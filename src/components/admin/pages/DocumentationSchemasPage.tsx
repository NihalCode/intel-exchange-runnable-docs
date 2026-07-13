"use client";

import { useEffect, useState } from "react";

type Version = {
  id: string;
  versionNumber: number;
  status: string;
  version: number;
  validation: { issues?: Array<{ severity: string; code: string; message: string }> };
  diff: { items?: Array<{ classification: string; location: string; message: string }> };
  preview: { title?: string; endpointCount?: number; pageCount?: number };
  breakingCount: number;
  authorUserId: string;
};
type Schema = {
  id: string;
  name: string;
  format: string;
  productId: string;
  environment: string;
  activeVersionId: string | null;
  versions: Version[];
};

async function csrfToken() {
  const response = await fetch("/api/admin/control-plane/context", { cache: "no-store" });
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

export function DocumentationSchemasPage({
  canManage,
  canReview,
  canPublish,
  currentUserId,
}: {
  canManage: boolean;
  canReview: boolean;
  canPublish: boolean;
  currentUserId: string;
}) {
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [name, setName] = useState("");
  const [format, setFormat] = useState("openapi-json");
  const [productId, setProductId] = useState("ctix");
  const [environment, setEnvironment] = useState("development");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/admin/documentation/schemas", { cache: "no-store" });
    if (!response.ok) return setError("Could not load schemas.");
    setSchemas(((await response.json()) as { schemas: Schema[] }).schemas);
  }
  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/documentation/schemas", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": await csrfToken() },
        body: JSON.stringify({ name, format, productId, environment, source }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Schema creation failed.");
      } else {
        setName("");
        setSource("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function action(version: Version, actionName: string) {
    const reason =
      actionName === "approve" || actionName === "reject"
        ? window.prompt(`Reason to ${actionName} this version:`) ?? ""
        : undefined;
    if ((actionName === "approve" || actionName === "reject") && !reason) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/documentation/schemas/versions/${version.id}/${actionName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": await csrfToken(),
            ...(actionName === "publish" ? { "Idempotency-Key": crypto.randomUUID() } : {}),
          },
          body: JSON.stringify({ expectedVersion: version.version, reason }),
        }
      );
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? `${actionName} failed.`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Documentation schemas</h1>
        <p className="mt-1 text-sm text-zinc-500">Validate, preview, review, and publish versioned API documentation sources.</p>
      </div>
      {canManage ? (
        <form onSubmit={create} className="space-y-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="font-semibold">Upload or paste schema</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Schema name" className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
            <select value={format} onChange={(event) => setFormat(event.target.value)} className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700">
              <option value="openapi-json">OpenAPI 3 JSON</option>
              <option value="openapi-yaml">OpenAPI 3 YAML</option>
              <option value="postman-json">Postman Collection JSON</option>
              <option value="theneo">Legacy Theneo</option>
              <option value="graphql-sdl">GraphQL SDL</option>
            </select>
            <select value={productId} onChange={(event) => setProductId(event.target.value)} className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700">
              {["ctix", "cftr", "orchestrate", "csap"].map((id) => <option key={id}>{id}</option>)}
            </select>
            <select value={environment} onChange={(event) => setEnvironment(event.target.value)} className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700">
              {["development", "staging", "production"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
          <input type="file" accept=".json,.yaml,.yml,.graphql,.gql,.md,.txt" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void file.text().then(setSource);
          }} className="text-xs" />
          <textarea required value={source} onChange={(event) => setSource(event.target.value)} rows={10} placeholder="Paste schema source" className="w-full rounded-md border border-zinc-300 bg-transparent p-3 font-mono text-xs dark:border-zinc-700" />
          <button disabled={busy} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Create draft</button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="space-y-4">
        {schemas.map((schema) => {
          const version = schema.versions[0];
          if (!version) return null;
          const issues = version.validation.issues ?? [];
          return (
            <section key={schema.id} className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{schema.name}</h2>
                  <p className="mt-1 text-xs text-zinc-500">{schema.format} · {schema.productId} · {schema.environment} · version {version.versionNumber}</p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">{version.status}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {canManage && ["DRAFT", "INVALID", "VALID"].includes(version.status) ? <button onClick={() => void action(version, "validate")} className="rounded border px-2 py-1 text-xs">Validate</button> : null}
                {canManage && version.status === "VALID" ? <button onClick={() => void action(version, "submit")} className="rounded bg-sky-600 px-2 py-1 text-xs text-white">Submit review</button> : null}
                {canReview && version.status === "PENDING_REVIEW" && version.authorUserId !== currentUserId ? <>
                  <button onClick={() => void action(version, "approve")} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">Approve</button>
                  <button onClick={() => void action(version, "reject")} className="rounded border px-2 py-1 text-xs">Reject</button>
                </> : null}
                {canPublish && version.status === "APPROVED" ? <button onClick={() => void action(version, "publish")} className="rounded bg-indigo-600 px-2 py-1 text-xs text-white">Publish</button> : null}
                {canPublish && version.status === "PUBLISHED" ? <button onClick={() => void action(version, "rollback")} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">Rollback</button> : null}
              </div>
              {version.preview.title ? <p className="mt-4 text-xs text-zinc-500">Preview: {version.preview.title} · {version.preview.endpointCount ?? 0} endpoints · {version.preview.pageCount ?? 0} pages</p> : null}
              {issues.length ? <div className="mt-3 space-y-1">{issues.map((item, index) => <p key={`${item.code}-${index}`} className="text-xs"><strong>{item.severity}</strong> · {item.code}: {item.message}</p>)}</div> : null}
              {(version.diff.items?.length ?? 0) > 0 ? <details className="mt-3 text-xs"><summary>Schema diff ({version.breakingCount} breaking)</summary><div className="mt-2 space-y-1">{version.diff.items!.map((item, index) => <p key={index}>{item.classification} · {item.location}: {item.message}</p>)}</div></details> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
