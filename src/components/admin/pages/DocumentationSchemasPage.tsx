"use client";

import { useEffect, useState } from "react";

import { LiveStatus } from "@/components/atlas";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  SignalButton,
  SignalCodeSurface,
  SignalEmptyState,
  SignalInput,
  SignalSelect,
  SignalTextarea,
} from "@/components/fabric";

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
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-schema-lineage"
    >
      <PageHeader
        eyebrow="Lineage workspace"
        title="Documentation schemas"
        description="Validate, preview, review, and publish versioned API documentation sources."
        actions={<LiveStatus label="Diff ready" tone="signal" />}
      />
      {canManage ? (
        <form
          onSubmit={create}
          className="space-y-4 rounded-[var(--radius-sm)] border border-[var(--atlas-line)] border-l-2 border-l-[var(--atlas-violet)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4"
        >
          <p className="atlas-micro-label text-[var(--atlas-violet)]">Ingest draft</p>
          <h2 className="text-sm font-semibold text-[var(--atlas-text)]">Upload or paste schema</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <SignalInput
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Schema name"
              label="Name"
            />
            <SignalSelect
              label="Format"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            >
              <option value="openapi-json">OpenAPI 3 JSON</option>
              <option value="openapi-yaml">OpenAPI 3 YAML</option>
              <option value="postman-json">Postman Collection JSON</option>
              <option value="theneo">Legacy Theneo</option>
              <option value="graphql-sdl">GraphQL SDL</option>
            </SignalSelect>
            <SignalSelect
              label="Product"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              {["ctix", "cftr", "orchestrate", "csap"].map((id) => (
                <option key={id}>{id}</option>
              ))}
            </SignalSelect>
            <SignalSelect
              label="Environment"
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
            >
              {["development", "staging", "production"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </SignalSelect>
          </div>
          <input
            type="file"
            accept=".json,.yaml,.yml,.graphql,.gql,.md,.txt"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void file.text().then(setSource);
            }}
            className="text-xs text-[var(--atlas-text-secondary)]"
          />
          <SignalTextarea
            required
            value={source}
            onChange={(event) => setSource(event.target.value)}
            rows={10}
            placeholder="Paste schema source"
            label="Source"
            className="font-mono text-xs"
          />
          <SignalButton type="submit" disabled={busy} loading={busy}>
            Create draft
          </SignalButton>
        </form>
      ) : null}
      {error ? (
        <p
          className="rounded-[var(--radius-sm)] border border-[var(--atlas-danger)] bg-[color-mix(in_srgb,var(--atlas-danger)_10%,transparent)] px-3 py-2 text-sm text-[var(--atlas-danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="space-y-3">
        {schemas.length === 0 ? (
          <SignalEmptyState
            title="No schemas yet"
            description="Create a draft schema to begin lineage review."
          />
        ) : null}
        {schemas.map((schema) => {
          const version = schema.versions[0];
          if (!version) return null;
          const issues = version.validation.issues ?? [];
          return (
            <section
              key={schema.id}
              className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="atlas-micro-label text-[var(--atlas-violet)]">
                    {schema.productId} · {schema.environment}
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">
                    {schema.name}
                  </h2>
                  <p className="mt-1 font-mono text-[10px] text-[var(--atlas-text-muted)]">
                    {schema.format} · version {version.versionNumber}
                  </p>
                </div>
                <StatusBadge status={version.status} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {canManage && ["DRAFT", "INVALID", "VALID"].includes(version.status) ? (
                  <SignalButton
                    size="sm"
                    variant="secondary"
                    onClick={() => void action(version, "validate")}
                  >
                    Validate
                  </SignalButton>
                ) : null}
                {canManage && version.status === "VALID" ? (
                  <SignalButton size="sm" onClick={() => void action(version, "submit")}>
                    Submit review
                  </SignalButton>
                ) : null}
                {canReview &&
                version.status === "PENDING_REVIEW" &&
                version.authorUserId !== currentUserId ? (
                  <>
                    <SignalButton
                      size="sm"
                      variant="success"
                      onClick={() => void action(version, "approve")}
                    >
                      Approve
                    </SignalButton>
                    <SignalButton
                      size="sm"
                      variant="secondary"
                      onClick={() => void action(version, "reject")}
                    >
                      Reject
                    </SignalButton>
                  </>
                ) : null}
                {canPublish && version.status === "APPROVED" ? (
                  <SignalButton size="sm" onClick={() => void action(version, "publish")}>
                    Publish
                  </SignalButton>
                ) : null}
                {canPublish && version.status === "PUBLISHED" ? (
                  <SignalButton
                    size="sm"
                    variant="danger"
                    onClick={() => void action(version, "rollback")}
                  >
                    Rollback
                  </SignalButton>
                ) : null}
              </div>
              {version.preview.title ? (
                <p className="mt-4 font-mono text-[10px] text-[var(--atlas-text-muted)]">
                  Preview: {version.preview.title} · {version.preview.endpointCount ?? 0} endpoints ·{" "}
                  {version.preview.pageCount ?? 0} pages
                </p>
              ) : null}
              {issues.length ? (
                <div className="mt-3 space-y-1 rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--surface-sunken)] p-3">
                  <p className="atlas-micro-label text-[var(--atlas-amber)]">Validation</p>
                  {issues.map((item, index) => (
                    <p key={`${item.code}-${index}`} className="text-xs text-[var(--atlas-text-secondary)]">
                      <strong className="text-[var(--atlas-text)]">{item.severity}</strong> ·{" "}
                      {item.code}: {item.message}
                    </p>
                  ))}
                </div>
              ) : null}
              {(version.diff.items?.length ?? 0) > 0 ? (
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer atlas-micro-label !inline text-[var(--atlas-violet)]">
                    Schema diff ({version.breakingCount} breaking)
                  </summary>
                  <SignalCodeSurface className="mt-2 space-y-1 p-3">
                    {version.diff.items!.map((item, index) => (
                      <p key={index} className="font-mono text-[10px] text-[var(--atlas-text-secondary)]">
                        {item.classification} · {item.location}: {item.message}
                      </p>
                    ))}
                  </SignalCodeSurface>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
