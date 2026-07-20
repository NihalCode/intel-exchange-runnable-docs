import type { AgentStepResult } from "./types";

/* ─────────────────────── API route generators ──────────────────────── */

export function searchRoute(): string {
  return `import { NextResponse } from "next/server";
import { cywareClientFromEnv } from "@/lib/cyware/client";

/** IOC type → Cyware CQL ioc_type value */
const IOC_CQL_TYPE: Record<string, string> = {
  ipv4: "ipv4-addr",
  ipv6: "ipv6-addr",
  domain: "domain-name",
  url: "url",
  email: "email-addr",
  md5: "MD5",
  sha1: "SHA-1",
  sha256: "SHA-256",
};

interface IOCRequest {
  type: string;
  value: string;
}

export function parseRiskScore(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "" || raw === "NA") return undefined;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (Number.isNaN(n) || n < 0) return undefined;
  return Math.round(n);
}

export function riskScoreFromRecord(row: Record<string, unknown>): number | undefined {
  return (
    parseRiskScore(row.confidence_score) ??
    parseRiskScore(row.analyst_score) ??
    parseRiskScore(row.risk_score)
  );
}

export async function POST(req: Request) {
  try {
    const { ioc }: { ioc: IOCRequest } = await req.json();
    const cqlType = IOC_CQL_TYPE[ioc.type];

    if (!cqlType) {
      return NextResponse.json({ found: false, error: \`Unsupported IOC type: \${ioc.type}\` });
    }

    // Sanitise value — strip any quotes to prevent CQL injection
    const safeValue = ioc.value.replace(/"/g, "").trim();
    const query = \`type = "indicator" AND ioc_type = "\${cqlType}" AND value = "\${safeValue}"\`;

    const client = cywareClientFromEnv();
    const result = await client.request<{
      results?: Record<string, unknown>[];
      count?: number;
    }>({
      method: "POST",
      path: "ingestion/threat-data/list/",
      body: { query },
      query: { page: "1", page_size: "1" },
    });

    const first = result.data.results?.[0];
    const found = (result.data.results?.length ?? 0) > 0;
    let confidenceScore = first ? riskScoreFromRecord(first) : undefined;

    // List API sometimes omits score — fetch via Refresh Confidence Score when we have an ID
    if (found && first?.id && confidenceScore === undefined) {
      try {
        const scoreRes = await client.request<{ score?: number | string }>({
          method: "GET",
          path: \`ingestion/threat-data/indicator/\${encodeURIComponent(String(first.id))}/refresh-score/\`,
        });
        confidenceScore = parseRiskScore(scoreRes.data.score);
      } catch {
        /* score optional */
      }
    }

    return NextResponse.json({
      found,
      id: found ? String(first?.id ?? "") : undefined,
      tlp: found ? (first?.tlp as string | undefined) : undefined,
      confidence_score: confidenceScore,
      value: found ? (first?.value as string | undefined) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message, found: false }, { status: 502 });
  }
}
`;
}

export function createIntelRoute(): string {
  return `import { NextResponse } from "next/server";
import { cywareClientFromEnv } from "@/lib/cyware/client";

interface CreateIntelRequest {
  value: string;
  type: string;
  tlp?: string;
}

/** Frontend extractor type → Quick Add Intel \`indicators\` object key (see docs) */
const IOC_INDICATOR_KEY: Record<string, string> = {
  ipv4: "ipv4-addr",
  ipv6: "ipv6-addr",
  domain: "domain",
  url: "url",
  email: "email",
  md5: "md5",
  sha1: "sha1",
  sha256: "sha256",
};

export async function POST(req: Request) {
  try {
    const { value, type, tlp = "AMBER" }: CreateIntelRequest = await req.json();
    const indicatorKey = IOC_INDICATOR_KEY[type];

    if (!indicatorKey) {
      return NextResponse.json({ error: \`Unsupported IOC type: \${type}\` }, { status: 400 });
    }

    const safeValue = value.replace(/,/g, "").trim();
    if (!safeValue) {
      return NextResponse.json({ error: "IOC value is required" }, { status: 400 });
    }

    const client = cywareClientFromEnv();
    const result = await client.request<{ task_id?: string; details?: string }>({
      method: "POST",
      path: "conversion/quick-intel/create-stix/",
      body: {
        indicators: { [indicatorKey]: safeValue },
        metadata: { tlp, is_apply_all: true },
        title: \`Phishing IOC: \${safeValue.slice(0, 80)}\`,
        create_intel_feed: true,
      },
    });

    return NextResponse.json({
      success: true,
      taskId: result.data.task_id,
      message: result.data.details ?? "Intel submitted to Cyware",
    }, { status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create intel failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
`;
}

export function routeForStep(step: AgentStepResult): string {
  const queryKeys = step.spec.queryParameters
    .filter((q) => !["AccessID", "Signature", "Expires"].includes(q.name))
    .map((q) => q.name);

  const bodyNote = step.request.body
    ? "    const body = await req.json().catch(() => ({}));"
    : "    const body = undefined;";

  const queryParse =
    queryKeys.length > 0
      ? `    const { searchParams } = new URL(req.url);
    const query: Record<string, string> = {};
${queryKeys.map((k) => `    const _${k} = searchParams.get("${k}"); if (_${k}) query["${k}"] = _${k};`).join("\n")}`
      : "    const query: Record<string, string> = {};";

  return `import { NextResponse } from "next/server";
import { cywareClientFromEnv } from "@/lib/cyware/client";

/**
 * Proxy route: ${step.method} ${step.path}
 * Docs: https://intel-exchange-runnable-docs.vercel.app${step.docUrl}
 *
 * Query params: ${step.spec.queryParameters.map((q) => q.name).join(", ") || "none"}
 * Body fields:  ${step.spec.bodyParameters.map((b) => b.name).join(", ") || "none"}
 */
export async function ${step.method === "GET" ? "GET" : "POST"}(req: Request) {
  try {
${queryParse}
${bodyNote}
    const client = cywareClientFromEnv();
    const result = await client.request({
      method: "${step.method}",
      path: "${step.spec.path.startsWith("/") ? step.spec.path : "/" + step.spec.path}",
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

/* ──────────────────────────── frontend ────────────────────────────── */

export function phishingFrontend(title: string): string {
  return `"use client";

import { useState } from "react";

type IocType = "ipv4" | "ipv6" | "domain" | "url" | "email" | "md5" | "sha1" | "sha256";

interface IOC {
  type: IocType;
  value: string;
  found?: boolean;
  cywareId?: string;
  tlp?: string;
  confidenceScore?: number;
  checking?: boolean;
  creating?: boolean;
  created?: boolean;
  error?: string;
}

const IOC_LABEL: Record<IocType, string> = {
  ipv4: "IPv4",
  ipv6: "IPv6",
  domain: "Domain",
  url: "URL",
  email: "Email",
  md5: "MD5",
  sha1: "SHA-1",
  sha256: "SHA-256",
};

export function extractIOCs(text: string): IOC[] {
  const seen = new Set<string>();
  const iocs: IOC[] = [];

  function add(value: string, type: IocType) {
    const key = type + ":" + value.toLowerCase();
    if (!seen.has(key)) { seen.add(key); iocs.push({ type, value }); }
  }

  // Domains — skip if only seen as an email hostname (recipient org false positive)
  const emailDomains = new Set<string>();
  for (const m of text.matchAll(/\\b[a-z0-9._%+\\-]+@([a-z0-9.\\-]+\\.[a-z]{2,})\\b/gi)) {
    emailDomains.add(m[1].toLowerCase());
  }

  // URLs first (captures full URLs before domain extraction)
  for (const m of text.matchAll(/https?:\\/\\/[^\\s<>"'\\]\\[()]+/gi)) add(m[0], "url");

  // IPv4
  for (const m of text.matchAll(/\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b/g)) {
    const parts = m[0].split(".").map(Number);
    const isPrivate =
      (parts[0] === 10) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 127);
    if (!isPrivate) add(m[0], "ipv4");
  }

  // Domains (not in URL, not only a recipient email hostname)
  for (const m of text.matchAll(/\\b(?:[a-z0-9](?:[a-z0-9\\-]{0,61}[a-z0-9])?\\.)+(?:com|net|org|io|co|info|biz|edu|gov|mil|[a-z]{2})\\b/gi)) {
    const domain = m[0].toLowerCase();
    if (iocs.find(i => i.type === "url" && i.value.includes(domain))) continue;
    if (emailDomains.has(domain)) continue;
    add(domain, "domain");
  }

  // Email addresses
  for (const m of text.matchAll(/\\b[a-z0-9._%+\\-]+@[a-z0-9.\\-]+\\.[a-z]{2,}\\b/gi)) add(m[0].toLowerCase(), "email");

  // SHA-256 (64 hex chars)
  for (const m of text.matchAll(/\\b[a-f0-9]{64}\\b/gi)) add(m[0].toLowerCase(), "sha256");

  // SHA-1 (40 hex chars)
  for (const m of text.matchAll(/\\b[a-f0-9]{40}\\b/gi)) add(m[0].toLowerCase(), "sha1");

  // MD5 (32 hex chars)
  for (const m of text.matchAll(/\\b[a-f0-9]{32}\\b/gi)) add(m[0].toLowerCase(), "md5");

  return iocs;
}

/* ───────── file upload → text extraction (all client-side, CDN libs) ───────── */

const CDN = {
  pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  pdfjsWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
};

export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="' + src + '"]');
    if (existing) {
      if (existing.getAttribute("data-loaded") === "true") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load " + src)));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => { s.setAttribute("data-loaded", "true"); resolve(); };
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

/** Pull every IOC-bearing string out of a STIX 1.x/2.x JSON document. */
export function stixToText(node: unknown, out: string[]): void {
  if (typeof node === "string") return;
  if (Array.isArray(node)) { for (const n of node) stixToText(n, out); return; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (typeof v === "string" && ["pattern", "value", "name", "url", "address_value"].includes(k)) {
        out.push(v);
      } else if (k === "hashes" && v && typeof v === "object") {
        for (const h of Object.values(v as Record<string, unknown>)) {
          if (typeof h === "string") out.push(h);
        }
      } else if (v && typeof v === "object") {
        stixToText(v, out);
      }
    }
  }
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff"];

async function extractTextFromFile(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();

  if (ext === "pdf" || file.type === "application/pdf") {
    await loadScript(CDN.pdfjs);
    const pdfjs = (window as unknown as { pdfjsLib: any }).pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfjsWorker;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(content.items.map((it: { str?: string }) => it.str ?? "").join(" "));
    }
    return pages.join("\\n");
  }

  if (ext === "docx") {
    await loadScript(CDN.mammoth);
    const mammoth = (window as unknown as { mammoth: any }).mammoth;
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return String(result.value ?? "");
  }

  if (ext === "doc") {
    throw new Error(file.name + ": legacy .doc is not supported — save it as .docx and retry");
  }

  if (IMAGE_EXTS.includes(ext) || file.type.startsWith("image/")) {
    await loadScript(CDN.tesseract);
    const Tesseract = (window as unknown as { Tesseract: any }).Tesseract;
    const result = await Tesseract.recognize(file, "eng");
    return String(result.data?.text ?? "");
  }

  // STIX 2.x bundles and other JSON intel exports
  if (["json", "stix", "stix2"].includes(ext) || file.type === "application/json") {
    const text = await file.text();
    try {
      const out: string[] = [];
      stixToText(JSON.parse(text), out);
      if (out.length > 0) return out.join("\\n");
    } catch { /* not valid JSON — fall through to raw text */ }
    return text;
  }

  // eml, msg, txt, csv, xml, html, log… — IOC regexes work on raw text
  return await file.text();
}

const UPLOAD_ACCEPT =
  ".eml,.msg,.txt,.csv,.log,.html,.htm,.xml,.json,.stix,.stix2,.pdf,.docx,.doc,image/*";

export default function PhishingAnalyzerPage() {
  const [emailText, setEmailText] = useState("");
  const [iocs, setIOCs] = useState<IOC[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedNames, setUploadedNames] = useState<string[]>([]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    setGlobalError(null);
    const errors: string[] = [];
    for (const file of Array.from(list)) {
      try {
        const text = await extractTextFromFile(file);
        if (text.trim()) {
          setEmailText((prev) => (prev.trim() ? prev + "\\n\\n" : "") + text.trim());
          setUploadedNames((prev) => [...prev, file.name]);
        } else {
          errors.push(file.name + ": no text could be extracted");
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : file.name + ": failed to read");
      }
    }
    if (errors.length > 0) setGlobalError(errors.join(" · "));
    setUploading(false);
  }

  function handleExtract() {
    setGlobalError(null);
    const extracted = extractIOCs(emailText);
    if (extracted.length === 0) {
      setGlobalError("No IOCs found in the pasted text. Try including IP addresses, domains, or URLs.");
      return;
    }
    setIOCs(extracted);
  }

  function updateIOC(i: number, patch: Partial<IOC>) {
    setIOCs((prev) => prev.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  async function checkAll() {
    if (iocs.length === 0) return;
    setChecking(true);
    setGlobalError(null);
    for (let i = 0; i < iocs.length; i++) {
      updateIOC(i, { checking: true, error: undefined });
      try {
        const res = await fetch("/api/cyware/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ioc: { type: iocs[i].type, value: iocs[i].value } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        updateIOC(i, {
          checking: false,
          found: data.found,
          cywareId: data.id,
          tlp: data.tlp,
          confidenceScore: data.confidence_score,
        });
      } catch (e) {
        updateIOC(i, { checking: false, error: e instanceof Error ? e.message : "Failed" });
      }
    }
    setChecking(false);
  }

  async function createIntel(i: number) {
    updateIOC(i, { creating: true, error: undefined });
    try {
      const ioc = iocs[i];
      const res = await fetch("/api/cyware/create-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: ioc.value, type: ioc.type, tlp: "AMBER" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      updateIOC(i, { creating: false, created: true });
    } catch (e) {
      updateIOC(i, { creating: false, error: e instanceof Error ? e.message : "Create failed" });
    }
  }

  const checked = iocs.filter((i) => i.found !== undefined);
  const foundCount = checked.filter((i) => i.found).length;
  const notFoundCount = checked.filter((i) => !i.found).length;

  function riskBar(score: number | undefined) {
    if (score === undefined) return <span className="risk-score-na">N/A</span>;
    return (
      <div className="risk-score-cell">
        <div className="risk-score-value">{score}</div>
        <div className="risk-score-bar" title={\`Risk score \${score}/100\`}>
          <div className="risk-score-fill" style={{ width: \`\${Math.min(100, Math.max(0, score))}%\` }} />
        </div>
      </div>
    );
  }

  return (
    <main className="container">
      <h1>${title}</h1>
      <p className="subtitle">
        Paste phishing email content or upload files (.eml, STIX 2.x, PDF, Word, images, and more).
        IOCs are extracted in your browser; all Cyware lookups happen through secure server
        routes — your credentials never reach the client.
      </p>

      {/* Input */}
      <div className="card">
        <h2>Email Content</h2>
        <textarea
          rows={8}
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          placeholder="Paste raw email source or body here, or upload files below…&#10;&#10;Example: From: attacker@evil-domain.com&#10;Visit http://malware.example.com/payload&#10;C2: 198.51.100.42"
        />
        <label
          className="upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void handleFiles(e.dataTransfer.files); }}
        >
          <input
            type="file"
            multiple
            accept={UPLOAD_ACCEPT}
            style={{ display: "none" }}
            onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
          />
          {uploading ? (
            <span className="status-checking"><span className="spinner" style={{ borderTopColor: "#2563eb" }} /> Extracting text from files…</span>
          ) : (
            <span>
              Drop files here or click to upload — .eml, .msg, .txt, .csv, .xml, STIX 2.x (.json/.stix), PDF, Word (.docx), images (OCR)
            </span>
          )}
        </label>
        {uploadedNames.length > 0 && (
          <div className="upload-files">
            {uploadedNames.map((n, i) => <span key={i} className="badge badge-blue">{n}</span>)}
          </div>
        )}
        <div className="toolbar">
          <button
            type="button"
            onClick={handleExtract}
            disabled={!emailText.trim()}
            className="btn btn-primary"
          >
            Extract IOCs
          </button>
          {iocs.length > 0 && (
            <button
              type="button"
              onClick={checkAll}
              disabled={checking}
              className="btn btn-ghost"
            >
              {checking ? <><span className="spinner" /> Checking…</> : "Check all in Cyware"}
            </button>
          )}
        </div>
      </div>

      {globalError && <div className="alert alert-error">{globalError}</div>}

      {/* Summary */}
      {iocs.length > 0 && checked.length > 0 && (
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-number">{iocs.length}</div>
            <div className="summary-label">IOCs found</div>
          </div>
          <div className="summary-card">
            <div className="summary-number" style={{ color: "#166534" }}>{foundCount}</div>
            <div className="summary-label">In Cyware</div>
          </div>
          <div className="summary-card">
            <div className="summary-number" style={{ color: "#9f1239" }}>{notFoundCount}</div>
            <div className="summary-label">Not in Cyware</div>
          </div>
        </div>
      )}

      {/* Results table */}
      {iocs.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>TLP</th>
                  <th>Risk Score</th>
                  <th>Cyware ID</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {iocs.map((ioc, i) => (
                  <tr
                    key={i}
                    className={ioc.found === true ? "row-found" : ioc.found === false ? "row-not-found" : ""}
                  >
                    <td className="type-cell">
                      <span className="badge badge-gray">{IOC_LABEL[ioc.type]}</span>
                    </td>
                    <td className="value-cell">{ioc.value}</td>
                    <td>
                      {ioc.checking ? (
                        <span className="status-checking"><span className="spinner" style={{ borderTopColor: "#2563eb" }} /> Checking</span>
                      ) : ioc.error ? (
                        <span style={{ color: "#dc2626", fontSize: "0.8rem" }}>{ioc.error}</span>
                      ) : ioc.found === true ? (
                        <span className="status-found">✓ Found</span>
                      ) : ioc.found === false ? (
                        <span className="status-not-found">✗ Not found</span>
                      ) : (
                        <span className="status-pending">—</span>
                      )}
                    </td>
                    <td>
                      {ioc.tlp ? (
                        <span className={\`badge \${ioc.tlp === "RED" ? "badge-red" : ioc.tlp === "GREEN" ? "badge-green" : "badge-amber"}\`}>
                          {ioc.tlp}
                        </span>
                      ) : "—"}
                    </td>
                    <td>{riskBar(ioc.confidenceScore)}</td>
                    <td className="id-cell">{ioc.cywareId ? ioc.cywareId.slice(0, 8) + "…" : "—"}</td>
                    <td>
                      {ioc.found === false && !ioc.created && (
                        <button
                          type="button"
                          onClick={() => createIntel(i)}
                          disabled={ioc.creating}
                          className="btn btn-primary btn-sm"
                        >
                          {ioc.creating ? "Creating…" : "Add to Cyware"}
                        </button>
                      )}
                      {ioc.created && <span className="status-found" style={{ fontSize: "0.8rem" }}>✓ Created</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
`;
}

export function genericFrontend(title: string, steps: AgentStepResult[]): string {
  const apiRoutes = steps
    .map(
      (s) =>
        `  { label: ${JSON.stringify(s.title)}, method: ${JSON.stringify(s.method)}, href: "/api/cyware/${s.slug.replace(/\//g, "-")}", path: ${JSON.stringify(s.path)}, docs: ${JSON.stringify("https://intel-exchange-runnable-docs.vercel.app" + s.docUrl)} }`
    )
    .join(",\n");

  return `"use client";

import { useState } from "react";

const STEPS = [
${apiRoutes}
];

interface StepResult {
  label: string;
  status: number;
  data: unknown;
  error?: string;
  durationMs: number;
}

export default function CywareWorkflowPage() {
  const [results, setResults] = useState<Record<number, StepResult>>({});
  const [running, setRunning] = useState<number | null>(null);
  const [body, setBody] = useState<Record<number, string>>(
    Object.fromEntries(STEPS.map((_, i) => [i, ""]))
  );

  async function runStep(i: number) {
    setRunning(i);
    const step = STEPS[i];
    const t0 = Date.now();
    try {
      let parsedBody: unknown;
      if (step.method !== "GET" && body[i]?.trim()) {
        try { parsedBody = JSON.parse(body[i]); } catch { throw new Error("Invalid JSON in request body"); }
      }
      const res = await fetch(step.href, {
        method: step.method,
        headers: step.method !== "GET" ? { "Content-Type": "application/json" } : undefined,
        body: parsedBody !== undefined ? JSON.stringify(parsedBody) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? \`Step \${i + 1} failed (\${res.status})\`);
      setResults((prev) => ({ ...prev, [i]: { label: step.label, status: res.status, data, durationMs: Date.now() - t0 } }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [i]: { label: step.label, status: 0, data: null, error: e instanceof Error ? e.message : "failed", durationMs: Date.now() - t0 },
      }));
    }
    setRunning(null);
  }

  async function runAll() {
    for (let i = 0; i < STEPS.length; i++) await runStep(i);
  }

  const completedCount = Object.keys(results).length;

  return (
    <main className="container">
      <h1>${title}</h1>
      <p className="subtitle">
        Secure Next.js app calling Cyware Intel Exchange APIs from server routes.
        Credentials live in environment variables only.
      </p>

      <div className="card">
        <div className="toolbar">
          <button type="button" onClick={runAll} disabled={running !== null} className="btn btn-primary">
            {running !== null ? <><span className="spinner" /> Running step {running + 1} of ${steps.length}…</> : "Run all steps"}
          </button>
          {completedCount > 0 && (
            <span className="badge badge-blue">{completedCount} / ${steps.length} complete</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {STEPS.map((step, i) => {
          const result = results[i];
          const busy = running === i;
          return (
            <div key={i} className="card">
              <div className="toolbar" style={{ marginBottom: "0.5rem" }}>
                <span className="badge badge-gray">Step {i + 1}</span>
                <strong>{step.label}</strong>
                <code style={{ fontSize: "0.75rem", color: "#0284c7" }}>{step.method} {step.path}</code>
                <a href={step.docs} target="_blank" rel="noreferrer" style={{ fontSize: "0.75rem", color: "#64748b", textDecoration: "underline" }}>
                  docs ↗
                </a>
                <button
                  type="button"
                  onClick={() => runStep(i)}
                  disabled={busy || running !== null}
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: "auto" }}
                >
                  {busy ? <><span className="spinner" /> Running…</> : "Run step"}
                </button>
              </div>

              {step.method !== "GET" && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.375rem" }}>
                    Request body (JSON)
                  </label>
                  <textarea
                    rows={4}
                    value={body[i]}
                    onChange={(e) => setBody((prev) => ({ ...prev, [i]: e.target.value }))}
                    placeholder='{ "query": "type = \\"indicator\\"" }'
                    style={{ marginBottom: 0 }}
                  />
                </div>
              )}

              {result && (
                <div className={\`alert \${result.error ? "alert-error" : "alert-success"}\`} style={{ marginTop: "0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.375rem" }}>
                    <strong>{result.error ? "Error" : \`Status \${result.status}\`}</strong>
                    <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>{result.durationMs}ms</span>
                  </div>
                  <pre style={{ fontSize: "0.75rem", overflow: "auto", maxHeight: "200px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {result.error ?? JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
`;
}

/* ────────────────────────────── README ───────────────────────────── */

export function readme(title: string, steps: AgentStepResult[]): string {
  const stepList = steps
    .map((s) => `- **Step ${s.order}** — \`${s.method} ${s.spec.path}\` — [${s.title}](https://intel-exchange-runnable-docs.vercel.app${s.docUrl})`)
    .join("\n");

  return `# ${title}

> Generated by the [Intel Exchange Documentation Agent](https://intel-exchange-runnable-docs.vercel.app/agent).
> All API calls reference documented Cyware endpoints — no hallucinated APIs.

## Quick start

\`\`\`bash
cp .env.example .env.local   # add your Cyware credentials
npm install
npm run dev                   # http://localhost:3000
\`\`\`

## Environment variables

| Variable | Description |
|----------|-------------|
| \`CYWARE_BASE_URL\` | Your tenant API root, e.g. \`https://your-tenant.cyware.com/ctixapi\` |
| \`CYWARE_ACCESS_ID\` | Access ID from Integrators CSV |
| \`CYWARE_SECRET_KEY\` | Secret Key from Integrators CSV |

**Never commit \`.env.local\`.**

## Architecture

\`\`\`
Browser (React)
  ↓  fetch /api/cyware/*   (no Cyware credentials in browser)
Next.js Server
  ↓  HMAC-signed requests
Cyware Intel Exchange Open API
\`\`\`

## API workflow

${stepList}

## Deployment

### Vercel (recommended)

1. Push to GitHub
2. Import to [vercel.com](https://vercel.com)
3. Set env vars in Project → Settings → Environment Variables
4. Deploy

### Manual

\`\`\`bash
npm run build
npm start
\`\`\`

Set \`CYWARE_BASE_URL\`, \`CYWARE_ACCESS_ID\`, \`CYWARE_SECRET_KEY\` in your host's environment.
`;
}
