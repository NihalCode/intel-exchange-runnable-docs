import type { AgentAppBlueprint, AgentStepResult } from "./types";

function slugToExport(slug: string): string {
  const part = slug.split("/").pop() ?? slug;
  return part
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]?.toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
}

function envExample(): string {
  return `# Cyware Intel Exchange Open API — never commit real secrets
CYWARE_BASE_URL=https://your-tenant.cyware.com/ctixapi
CYWARE_ACCESS_ID=
CYWARE_SECRET_KEY=
`;
}

function clientFile(): string {
  return `import crypto from "node:crypto";

export interface CywareConfig {
  baseUrl: string;
  accessId: string;
  secretKey: string;
}

function sign(accessId: string, secretKey: string, expires: number): string {
  const payload = \`\${accessId}\\n\${expires}\`;
  return crypto.createHmac("sha1", secretKey).update(payload).digest("base64");
}

export class CywareClient {
  constructor(private cfg: CywareConfig) {}

  private authQuery(): Record<string, string> {
    const expires = Math.floor(Date.now() / 1000) + 20;
    return {
      AccessID: this.cfg.accessId,
      Expires: String(expires),
      Signature: sign(this.cfg.accessId, this.cfg.secretKey, expires),
    };
  }

  async request<T = unknown>(opts: {
    method: string;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ status: number; data: T; text: string }> {
    const base = this.cfg.baseUrl.replace(/\\/$/, "");
    const path = opts.path.startsWith("/") ? opts.path : \`/\${opts.path}\`;
    const url = new URL(base + path);
    for (const [k, v] of Object.entries({ ...this.authQuery(), ...opts.query })) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      method: opts.method,
      headers: {
        "Content-Type": "application/json",
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as T;
    }

    if (!res.ok) {
      throw new Error(\`Cyware \${opts.method} \${path} failed (\${res.status}): \${text.slice(0, 500)}\`);
    }

    return { status: res.status, data, text };
  }
}

export function cywareClientFromEnv(): CywareClient {
  const baseUrl = process.env.CYWARE_BASE_URL;
  const accessId = process.env.CYWARE_ACCESS_ID;
  const secretKey = process.env.CYWARE_SECRET_KEY;
  if (!baseUrl || !accessId || !secretKey) {
    throw new Error("Missing CYWARE_BASE_URL, CYWARE_ACCESS_ID, or CYWARE_SECRET_KEY");
  }
  return new CywareClient({ baseUrl, accessId, secretKey });
}
`;
}

function routeForStep(step: AgentStepResult): string {
  const exportName = slugToExport(step.slug);
  const path = step.spec.path.replace(/\{([^}]+)\}/g, ":$1");
  const routePath = `app/api/cyware/${step.slug.replace(/\//g, "-")}/route.ts`;

  const queryKeys = step.spec.queryParameters
    .filter((q) => !["AccessID", "Signature", "Expires"].includes(q.name))
    .map((q) => q.name);

  const bodyNote = step.request.body
    ? "  const body = await req.json().catch(() => ({}));"
    : "  const body = undefined;";

  const queryParse =
    queryKeys.length > 0
      ? `  const { searchParams } = new URL(req.url);
  const query: Record<string, string> = {};
${queryKeys.map((k) => `  const ${k} = searchParams.get("${k}"); if (${k}) query["${k}"] = ${k};`).join("\n")}`
      : "  const query: Record<string, string> = {};";

  return `import { NextResponse } from "next/server";
import { cywareClientFromEnv } from "@/lib/cyware/client";

/** Proxy: ${step.method} ${step.path} — ${step.title} */
export async function ${step.method === "GET" ? "GET" : "POST"}(req: Request) {
  try {
${queryParse}
${bodyNote}
    const client = cywareClientFromEnv();
    const result = await client.request({
      method: "${step.method}",
      path: "${step.path}",
      query,
      body,
    });
    return NextResponse.json(result.data, { status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cyware request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
`;
}

function frontendPage(title: string, steps: AgentStepResult[], useCase: string): string {
  const apiRoutes = steps
    .map(
      (s, i) =>
        `    { id: ${i + 1}, label: "${s.title}", method: "${s.method}", href: "/api/cyware/${s.slug.replace(/\//g, "-")}" }`
    )
    .join(",\n");

  const isPhishing = /phishing|email/i.test(useCase);

  if (isPhishing) {
    return `"use client";

import { useState } from "react";

const API_STEPS = [
${apiRoutes}
];

/** Extract simple IOCs from raw email text (extend with a proper parser in production). */
function extractIocs(text: string) {
  const ips = [...text.matchAll(/\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b/g)].map((m) => m[0]);
  const domains = [...text.matchAll(/\\b[a-z0-9][a-z0-9.-]+\\.(?:com|net|org|io|co)\\b/gi)].map((m) => m[0]);
  const urls = [...text.matchAll(/https?:\\/\\/[^\\s<>"']+/gi)].map((m) => m[0]);
  return { ips: [...new Set(ips)], domains: [...new Set(domains)], urls: [...new Set(urls)] };
}

export default function PhishingAnalyzerPage() {
  const [emailText, setEmailText] = useState("");
  const [results, setResults] = useState<{ step: string; status: number; data: unknown }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function analyze() {
    setBusy(true);
    setError(null);
    setResults([]);
    const iocs = extractIocs(emailText);
    const out: typeof results = [];

    try {
      for (const step of API_STEPS) {
        const res = await fetch(step.href, {
          method: step.method,
          headers: step.method !== "GET" ? { "Content-Type": "application/json" } : undefined,
          body:
            step.method !== "GET"
              ? JSON.stringify({ iocs, emailPreview: emailText.slice(0, 500) })
              : undefined,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? \`\${step.label} failed\`);
        out.push({ step: step.label, status: res.status, data });
      }
      setResults(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">${title}</h1>
      <p className="text-sm text-zinc-600">Paste phishing email content. IOCs are extracted client-side; Cyware calls go through server routes only.</p>
      <textarea
        className="w-full min-h-40 rounded border p-3 font-mono text-sm"
        value={emailText}
        onChange={(e) => setEmailText(e.target.value)}
        placeholder="Paste raw email source or body…"
      />
      <button
        type="button"
        onClick={analyze}
        disabled={busy || !emailText.trim()}
        className="rounded bg-sky-600 px-4 py-2 text-white font-semibold disabled:opacity-50"
      >
        {busy ? "Analyzing…" : "Analyze in Cyware"}
      </button>
      {error ? <p className="text-red-600 text-sm">{error}</p> : null}
      {results.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Results</h2>
          {results.map((r) => (
            <pre key={r.step} className="rounded border p-3 text-xs overflow-auto max-h-60">
              {r.step} ({r.status})\\n{JSON.stringify(r.data, null, 2)}
            </pre>
          ))}
        </section>
      ) : null}
    </main>
  );
}
`;
  }

  return `"use client";

import { useState } from "react";

const WORKFLOW = [
${apiRoutes}
];

export default function CywareAppPage() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function runWorkflow() {
    setBusy(true);
    setLog([]);
    try {
      for (const step of WORKFLOW) {
        const res = await fetch(step.href, { method: step.method });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? step.label + " failed");
        setLog((prev) => [...prev, \`\${step.label}: \${JSON.stringify(data).slice(0, 200)}…\`]);
      }
    } catch (e) {
      setLog((prev) => [...prev, "Error: " + (e instanceof Error ? e.message : "failed")]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-2xl font-bold">${title}</h1>
      <p className="text-sm text-zinc-600">Runs documented Cyware API steps via secure backend routes.</p>
      <button type="button" onClick={runWorkflow} disabled={busy} className="rounded bg-sky-600 px-4 py-2 text-white">
        {busy ? "Running…" : "Run workflow"}
      </button>
      <ul className="text-xs font-mono space-y-1">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </main>
  );
}
`;
}

function readme(title: string, steps: AgentStepResult[]): string {
  const stepList = steps
    .map((s) => `- **Step ${s.order}**: \`${s.method} ${s.path}\` — ${s.title} ([docs](${s.docUrl}))`)
    .join("\n");

  return `# ${title}

Generated by the Intel Exchange Documentation Agent. All API calls reference documented Cyware endpoints.

## Setup

1. Copy \`.env.example\` to \`.env.local\` and fill in Cyware credentials.
2. \`npm install\`
3. \`npm run dev\`

## Architecture

- **Frontend** (\`app/page.tsx\`) — user interface only; no Cyware secrets.
- **Backend** (\`app/api/cyware/*/route.ts\`) — server routes call Cyware with env credentials.
- **Client** (\`lib/cyware/client.ts\`) — reusable signed-request helper.

## Documented API workflow

${stepList}

## Deployment

Deploy to Vercel (or any Node host). Set \`CYWARE_BASE_URL\`, \`CYWARE_ACCESS_ID\`, and \`CYWARE_SECRET_KEY\` in environment variables — never in client bundles.
`;
}

export function generateAppBlueprint(
  query: string,
  title: string,
  description: string,
  steps: AgentStepResult[]
): AgentAppBlueprint {
  const architecture = [
    "User Browser",
    "  → Next.js frontend (React)",
    "  → /api/cyware/* server routes",
    "  → CywareClient (HMAC auth from env)",
    "  → Cyware Intel Exchange Open API",
  ].join("\n");

  const files = [
    {
      path: ".env.example",
      language: "bash",
      description: "Environment variables — copy to .env.local",
      code: envExample(),
    },
    {
      path: "lib/cyware/client.ts",
      language: "typescript",
      description: "Reusable server-side Cyware API client with HMAC auth",
      code: clientFile(),
    },
    ...steps.map((step) => ({
      path: `app/api/cyware/${step.slug.replace(/\//g, "-")}/route.ts`,
      language: "typescript",
      description: `${step.method} ${step.path} — ${step.title}`,
      code: routeForStep(step),
    })),
    {
      path: "app/page.tsx",
      language: "typescript",
      description: "Frontend UI — calls backend routes only",
      code: frontendPage(title, steps, query),
    },
    {
      path: "README.md",
      language: "markdown",
      description: "Setup and deployment instructions",
      code: readme(title, steps),
    },
  ];

  return {
    title,
    description,
    architecture,
    setupInstructions:
      "Copy .env.example → .env.local, add Cyware credentials, npm install && npm run dev. " +
      "Customize each /api/cyware route with the parameters you edited in the agent workflow steps.",
    envExample: envExample(),
    files,
  };
}

export function appTitleFromQuery(query: string): string {
  if (/phishing/i.test(query)) return "Phishing Email Analyzer";
  const m = query.match(/build\s+(?:a\s+)?(.{0,60}?)(?:\s+app|\s+website|\s+dashboard|$)/i);
  if (m?.[1]) {
    return m[1].replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  }
  return "Cyware Integration App";
}
