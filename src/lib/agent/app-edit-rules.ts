import type { AgentAppBlueprint } from "./types";

export interface EditResult {
  blueprint: AgentAppBlueprint;
  summary: string;
  changedPaths: string[];
}

/** Improved extractIOCs — skips domains that only appear as email hostnames (recipient false positives). */
const EXTRACT_IOCS_PATCH = `function extractIOCs(text: string): IOC[] {
  const seen = new Set<string>();
  const iocs: IOC[] = [];
  const emailDomains = new Set<string>();

  function add(value: string, type: IocType) {
    const key = type + ":" + value.toLowerCase();
    if (!seen.has(key)) { seen.add(key); iocs.push({ type, value }); }
  }

  // Collect email domains first (used to filter false-positive domain IOCs)
  for (const m of text.matchAll(/\\b[a-z0-9._%+\\-]+@([a-z0-9.\\-]+\\.[a-z]{2,})\\b/gi)) {
    emailDomains.add(m[1].toLowerCase());
  }

  // URLs first
  for (const m of text.matchAll(/https?:\\/\\/[^\\s<>"'\\]\\[()]+/gi)) add(m[0], "url");

  // IPv4 (skip private ranges)
  for (const m of text.matchAll(/\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b/g)) {
    const parts = m[0].split(".").map(Number);
    const isPrivate =
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 127;
    if (!isPrivate) add(m[0], "ipv4");
  }

  // Domains — skip if only seen as an email hostname (recipient org false positive)
  for (const m of text.matchAll(/\\b(?:[a-z0-9](?:[a-z0-9\\-]{0,61}[a-z0-9])?\\.)+(?:com|net|org|io|co|info|biz|edu|gov|mil|[a-z]{2})\\b/gi)) {
    const domain = m[0].toLowerCase();
    if (iocs.find((i) => i.type === "url" && i.value.includes(domain))) continue;
    if (emailDomains.has(domain)) continue;
    add(domain, "domain");
  }

  // Emails
  for (const m of text.matchAll(/\\b[a-z0-9._%+\\-]+@[a-z0-9.\\-]+\\.[a-z]{2,}\\b/gi)) add(m[0].toLowerCase(), "email");

  // Hashes
  for (const m of text.matchAll(/\\b[a-f0-9]{64}\\b/gi)) add(m[0].toLowerCase(), "sha256");
  for (const m of text.matchAll(/\\b[a-f0-9]{40}\\b/gi)) add(m[0].toLowerCase(), "sha1");
  for (const m of text.matchAll(/\\b[a-f0-9]{32}\\b/gi)) add(m[0].toLowerCase(), "md5");

  return iocs;
}`;

/* ───────────────────── file upload feature patch ───────────────────── */

/** Top-level helpers injected above the page component. */
const UPLOAD_HELPERS_PATCH = `
/* agent:file-upload helpers — parsing happens in the browser sandbox; files are never executed or sent to any server */
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_EXTS = ["eml", "msg", "txt", "csv", "log", "html", "htm", "xml", "json", "stix", "stix2", "pdf", "doc", "docx", "png", "jpg", "jpeg", "webp"];
const UPLOAD_ACCEPT = UPLOAD_EXTS.map((e) => "." + e).join(",");

const UPLOAD_CDN = {
  pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  pdfjsWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
};

function loadUploadScript(src: string): Promise<void> {
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

interface UploadEntry {
  id: string;
  name: string;
  type: string;
  size: number;
  status: "extracting" | "done" | "error";
  error?: string;
}

function formatUploadBytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

async function extractUploadText(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();

  if (ext === "pdf") {
    await loadUploadScript(UPLOAD_CDN.pdfjs);
    const pdfjs = (window as unknown as { pdfjsLib: any }).pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = UPLOAD_CDN.pdfjsWorker;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(content.items.map((it: { str?: string }) => it.str ?? "").join(" "));
    }
    return pages.join("\\n");
  }

  if (ext === "docx") {
    await loadUploadScript(UPLOAD_CDN.mammoth);
    const mammoth = (window as unknown as { mammoth: any }).mammoth;
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return String(result.value ?? "");
  }

  if (ext === "doc") {
    throw new Error("Legacy .doc is not supported — save it as .docx and retry");
  }

  if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
    // OCR via Tesseract.js (WASM, runs locally in the browser)
    await loadUploadScript(UPLOAD_CDN.tesseract);
    const Tesseract = (window as unknown as { Tesseract: any }).Tesseract;
    const result = await Tesseract.recognize(file, "eng");
    return String(result.data?.text ?? "");
  }

  // eml, msg, txt, csv, xml, html, json, stix… — IOC regexes work on raw text
  return await file.text();
}
`;

/** Component state + upload handler, inserted after the checking state hook. */
const UPLOAD_STATE_PATCH = `  const [uploads, setUploads] = useState<UploadEntry[]>([]);

  async function handleUploadFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    for (const file of Array.from(list)) {
      const id = file.name + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      setUploads((prev) => [...prev, { id, name: file.name, type: ext || file.type || "unknown", size: file.size, status: "extracting" }]);
      const fail = (msg: string) =>
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "error" as const, error: msg } : u)));
      if (!UPLOAD_EXTS.includes(ext)) { fail("Unsupported file type"); continue; }
      if (file.size > UPLOAD_MAX_BYTES) { fail("File exceeds 10 MB limit"); continue; }
      try {
        const text = (await extractUploadText(file)).trim();
        if (!text) { fail("No text could be extracted"); continue; }
        setEmailText((prev) => (prev.trim() ? prev + "\\n\\n" : "") + text);
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "done" as const } : u)));
      } catch (e) {
        fail(e instanceof Error ? e.message : "Extraction failed");
      }
    }
  }
`;

/** Drop zone + per-file status list, inserted right after the email textarea. */
const UPLOAD_UI_PATCH = `
        {/* agent:file-upload */}
        <div
          className="upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void handleUploadFiles(e.dataTransfer.files); }}
          onClick={() => document.getElementById("agent-upload-input")?.click()}
        >
          <input
            id="agent-upload-input"
            type="file"
            multiple
            accept={UPLOAD_ACCEPT}
            style={{ display: "none" }}
            onChange={(e) => { void handleUploadFiles(e.target.files); e.target.value = ""; }}
          />
          <span>Drop files here or click to upload — .eml, .msg, .txt, .html, .pdf, .docx, images (max 10 MB each)</span>
        </div>
        {uploads.length > 0 && (
          <ul className="upload-list">
            {uploads.map((u) => (
              <li key={u.id} className={"upload-item upload-" + u.status}>
                <span className="upload-name">{u.name}</span>
                <span className="upload-meta">{u.type + " · " + formatUploadBytes(u.size)}</span>
                <span className="upload-status">
                  {u.status === "extracting" ? "Extracting…" : u.status === "done" ? "✓ Extracted" : "✗ " + (u.error ?? "Failed")}
                </span>
              </li>
            ))}
          </ul>
        )}
`;

const UPLOAD_CSS_PATCH = `

/* agent:file-upload */
.upload-zone {
  display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  padding: 0.875rem 1rem; margin-bottom: 1rem;
  border: 1.5px dashed #cbd5e1; border-radius: 10px;
  background: rgba(148, 163, 184, 0.08);
  color: #64748b; font-size: 0.8125rem; text-align: center; cursor: pointer;
  transition: border-color 0.15s;
}
.upload-zone:hover { border-color: #3b82f6; }
.upload-list { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-direction: column; gap: 0.375rem; }
.upload-item {
  display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
  font-size: 0.8125rem; padding: 0.5rem 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 8px;
}
.upload-name { font-weight: 600; word-break: break-all; }
.upload-meta { color: #64748b; }
.upload-status { margin-left: auto; }
.upload-done .upload-status { color: #19c99a; }
.upload-error .upload-status { color: #ef4444; }
`;

function patchUploadPage(code: string): string | null {
  // Already has an upload feature (new template or previously patched)
  if (
    code.includes("agent:file-upload") ||
    code.includes("extractTextFromFile") ||
    code.includes("handleUploadFiles")
  ) {
    return null;
  }

  const exportIdx = code.search(/\nexport default function /);
  if (exportIdx < 0) return null;

  const stateAnchor = code.match(/[ \t]*const \[checking, setChecking\] = useState\(false\);[^\n]*\n/);
  if (!stateAnchor || stateAnchor.index === undefined) return null;

  const textareaMatch = code.match(/<textarea[\s\S]*?\/>/);
  if (!textareaMatch || textareaMatch.index === undefined) return null;

  // Apply bottom-up so earlier indices stay valid
  const inserts: { at: number; text: string }[] = [
    { at: exportIdx + 1, text: UPLOAD_HELPERS_PATCH + "\n" },
    { at: stateAnchor.index + stateAnchor[0].length, text: UPLOAD_STATE_PATCH },
    { at: textareaMatch.index + textareaMatch[0].length, text: UPLOAD_UI_PATCH },
  ].sort((a, b) => b.at - a.at);

  let next = code;
  for (const ins of inserts) {
    next = next.slice(0, ins.at) + ins.text + next.slice(ins.at);
  }
  return next;
}

function patchUploadFeature(blueprint: AgentAppBlueprint): EditResult | null {
  const page = blueprint.files.find((f) => f.path === "app/page.tsx");
  if (!page) return null;
  const nextPage = patchUploadPage(page.code);
  if (nextPage === null) return null;

  const changedPaths = ["app/page.tsx"];
  const files = blueprint.files.map((f) => {
    if (f.path === "app/page.tsx") return { ...f, code: nextPage };
    if (f.path === "app/globals.css" && !f.code.includes("agent:file-upload")) {
      changedPaths.push(f.path);
      return { ...f, code: f.code + UPLOAD_CSS_PATCH };
    }
    return f;
  });

  return {
    blueprint: { ...blueprint, files },
    summary: "Added file upload",
    changedPaths,
  };
}

function patchFile(
  blueprint: AgentAppBlueprint,
  path: string,
  transform: (code: string) => string | null
): EditResult | null {
  const file = blueprint.files.find((f) => f.path === path);
  if (!file) return null;
  const next = transform(file.code);
  if (next === null || next === file.code) return null;
  return {
    blueprint: {
      ...blueprint,
      files: blueprint.files.map((f) => (f.path === path ? { ...f, code: next } : f)),
    },
    summary: `Updated ${path}`,
    changedPaths: [path],
  };
}

function replaceExtractIocs(code: string): string | null {
  if (code.includes("emailDomains")) return null; // already patched
  const match = code.match(/function extractIOCs\([\s\S]*?\n\}/);
  if (!match) return null;
  return code.replace(match[0], EXTRACT_IOCS_PATCH);
}

function patchDarkMode(code: string): string | null {
  if (code.includes("/* agent:dark-mode */")) return null;
  return (
    code +
    `

/* agent:dark-mode */
@media (prefers-color-scheme: dark) {
  body { background: #0f172a; color: #e2e8f0; }
  .card { background: #1e293b; border-color: #334155; }
  textarea, input[type="text"] { background: #0f172a; border-color: #475569; color: #e2e8f0; }
  th { background: #1e293b; color: #94a3b8; }
  td { border-color: #334155; }
  tbody tr:hover td { background: #1e293b; }
}
`
  );
}

/* ───────────────────── theme switcher feature patch ───────────────────── */

const THEME_STATE_PATCH = `  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("cyware-theme");
    const initial =
      saved === "light" || saved === "dark"
        ? saved
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    setTheme(initial);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("cyware-theme", theme);
  }, [theme]);

`;

const THEME_TOGGLE_PATCH = `      {/* agent:theme-switcher */}
      <header className="app-header">
        <div>
          <span className="eyebrow">Cyware Intel Exchange</span>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          aria-label="Toggle light and dark theme"
        >
          <span>{theme === "dark" ? "🌙" : "☀️"}</span>
          {theme === "dark" ? "Dark" : "Light"}
        </button>
      </header>
`;

const THEME_CSS_PATCH = `

/* agent:theme-switcher */
:root {
  --cyware-blue: #2563eb;
  --cyware-purple: #8b5cf6;
  --cyware-teal: #19c99a;
  --cyware-dark: #07111f;
  --app-bg: #f8fafc;
  --surface: rgba(255, 255, 255, 0.92);
  --surface-soft: #ffffff;
  --surface-hover: #eff6ff;
  --text-primary: #0f172a;
  --text-muted: #64748b;
  --border-subtle: #e2e8f0;
  --shadow-soft: 0 16px 40px rgba(15, 23, 42, 0.08);
}

:root[data-theme="dark"] {
  --app-bg: radial-gradient(circle at 12% 8%, rgba(37, 99, 235, 0.26), transparent 28%),
    radial-gradient(circle at 86% 12%, rgba(139, 92, 246, 0.24), transparent 30%),
    radial-gradient(circle at 70% 88%, rgba(25, 201, 154, 0.18), transparent 32%),
    var(--cyware-dark);
  --surface: rgba(15, 23, 42, 0.72);
  --surface-soft: rgba(17, 24, 39, 0.86);
  --surface-hover: rgba(37, 99, 235, 0.18);
  --text-primary: #eef6ff;
  --text-muted: #a9b8d4;
  --border-subtle: rgba(148, 163, 184, 0.26);
  --shadow-soft: 0 24px 70px rgba(0, 0, 0, 0.4), 0 0 34px rgba(37, 99, 235, 0.12);
}

html, body { background: var(--app-bg); color: var(--text-primary); }
body { min-height: 100vh; }
.container { color: var(--text-primary); }
.app-header {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  margin-bottom: 1.25rem; padding: 0.875rem 1rem;
  border: 1px solid var(--border-subtle); border-radius: 16px;
  background: var(--surface); box-shadow: var(--shadow-soft); backdrop-filter: blur(18px);
}
.eyebrow {
  display: inline-block; color: var(--text-muted); font-size: 0.72rem;
  font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
}
.theme-toggle {
  display: inline-flex; align-items: center; gap: 0.45rem; border: 1px solid var(--border-subtle);
  background: linear-gradient(135deg, rgba(37,99,235,0.16), rgba(139,92,246,0.12));
  color: var(--text-primary); border-radius: 999px; padding: 0.5rem 0.8rem;
  font-weight: 700; cursor: pointer; box-shadow: 0 0 0 rgba(37,99,235,0);
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}
.theme-toggle:hover {
  transform: translateY(-1px); border-color: rgba(37, 99, 235, 0.55);
  box-shadow: 0 0 22px rgba(37,99,235,0.28), 0 0 30px rgba(139,92,246,0.18);
}
.card, .summary-card, .table-wrapper {
  background: var(--surface); border-color: var(--border-subtle);
  box-shadow: var(--shadow-soft); backdrop-filter: blur(18px);
}
.card:hover, .summary-card:hover { box-shadow: var(--shadow-soft), 0 0 28px rgba(37,99,235,0.14); }
textarea, input, select {
  background: var(--surface-soft); color: var(--text-primary); border-color: var(--border-subtle);
}
textarea::placeholder, input::placeholder { color: var(--text-muted); }
th { background: var(--surface-soft); color: var(--text-muted); border-color: var(--border-subtle); }
td { border-color: var(--border-subtle); }
tbody tr:hover td { background: var(--surface-hover); }
.value-cell, .risk-score-value { color: var(--text-primary); }
.type-cell, .id-cell, .summary-label, .upload-meta, .risk-score-na { color: var(--text-muted); }
.btn-primary {
  background: linear-gradient(135deg, var(--cyware-blue), #3b82f6); color: #fff;
  box-shadow: 0 0 18px rgba(37,99,235,0.24);
}
.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #1d4ed8, var(--cyware-blue));
  box-shadow: 0 0 26px rgba(37,99,235,0.36);
}
.btn-ghost { color: var(--text-primary); border-color: var(--border-subtle); }
.btn-ghost:hover:not(:disabled) { background: var(--surface-hover); box-shadow: 0 0 18px rgba(139,92,246,0.18); }
.badge-blue { background: rgba(37,99,235,0.16); color: #93c5fd; }
.badge-green, .status-found, .upload-done .upload-status { color: var(--cyware-teal); }
.alert-info { background: rgba(37,99,235,0.12); border-color: rgba(37,99,235,0.3); color: var(--text-primary); }
.alert-success { background: rgba(25,201,154,0.12); border-color: rgba(25,201,154,0.3); color: var(--cyware-teal); }
`;

function ensureUseEffectImport(code: string): string {
  if (/import\s*\{\s*[^}]*useEffect[^}]*\}\s*from\s*["']react["']/.test(code)) return code;
  return code.replace(/import\s*\{\s*([^}]*)\}\s*from\s*["']react["'];/, (_m, imports: string) => {
    const names = imports.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (!names.includes("useEffect")) names.push("useEffect");
    return `import { ${names.join(", ")} } from "react";`;
  });
}

function patchThemeSwitcherPage(code: string): string | null {
  if (code.includes("agent:theme-switcher") || code.includes("cyware-theme")) return null;

  let next = ensureUseEffectImport(code);
  if (!next.includes("useEffect")) return null;

  const firstState = next.match(/[ \t]*const \[[^\]]+\] = useState\([^;]+;[^\n]*\n/);
  if (!firstState || firstState.index === undefined) return null;

  const mainMatch = next.match(/<main(?:\s+[^>]*)?>/);
  if (!mainMatch || mainMatch.index === undefined) return null;

  const inserts: { at: number; text: string }[] = [
    { at: firstState.index + firstState[0].length, text: THEME_STATE_PATCH },
    { at: mainMatch.index + mainMatch[0].length, text: "\n" + THEME_TOGGLE_PATCH },
  ].sort((a, b) => b.at - a.at);

  for (const ins of inserts) {
    next = next.slice(0, ins.at) + ins.text + next.slice(ins.at);
  }
  return next;
}

function patchThemeSwitcherFeature(blueprint: AgentAppBlueprint): EditResult | null {
  const page = blueprint.files.find((f) => f.path === "app/page.tsx");
  if (!page) return null;
  const nextPage = patchThemeSwitcherPage(page.code);
  if (nextPage === null) return null;

  const changedPaths = ["app/page.tsx"];
  const files = blueprint.files.map((f) => {
    if (f.path === "app/page.tsx") return { ...f, code: nextPage };
    if (f.path === "app/globals.css" && !f.code.includes("agent:theme-switcher")) {
      changedPaths.push(f.path);
      return { ...f, code: f.code + THEME_CSS_PATCH };
    }
    return f;
  });

  return {
    blueprint: { ...blueprint, files },
    summary: "Added theme switcher",
    changedPaths,
  };
}

const RULES: {
  test: (q: string) => boolean;
  apply: (blueprint: AgentAppBlueprint) => EditResult | null;
  summary: string;
}[] = [
  {
    test: (q) => /theme switch|theme toggle|toggle.*theme|light mode.*dark mode|dark mode.*light mode/i.test(q),
    summary:
      "Added a light/dark theme switcher in the header, defaulting to dark mode, saving preference in localStorage, " +
      "respecting system theme only when no preference exists, and polishing both light and vivid Cyware dark modes.",
    apply: patchThemeSwitcherFeature,
  },
  {
    test: (q) =>
      /recipient|email address|user@|false positive|company\.org|skip.*domain|domain.*email|email.*domain/i.test(
        q
      ),
    summary: "Skip domains that only appear in recipient email addresses",
    apply: (bp) => patchFile(bp, "app/page.tsx", replaceExtractIocs),
  },
  {
    test: (q) =>
      /dark mode|dark theme|dark ui|night mode/i.test(q) &&
      !/theme switch|theme toggle|toggle.*theme|light mode.*dark mode|dark mode.*light mode/i.test(q),
    summary: "Add dark mode styles",
    apply: (bp) => patchFile(bp, "app/globals.css", patchDarkMode),
  },
  {
    test: (q) => /upload|drag.{0,12}drop|attach(ment)?s? /i.test(q),
    summary:
      "Added a drag-and-drop file upload area below the email box (.eml, .msg, .txt, .html, .pdf, .docx, images with OCR). " +
      "Files are validated by type and size (10 MB max), parsed in the browser sandbox without ever being executed, " +
      "and extracted text feeds the existing IOC analysis flow.",
    apply: patchUploadFeature,
  },
];

/**
 * Apply deterministic edits without LLM — reliable for common refinement requests.
 */
export function applyRuleBasedEdits(
  query: string,
  blueprint: AgentAppBlueprint
): EditResult | null {
  for (const rule of RULES) {
    if (!rule.test(query)) continue;
    const result = rule.apply(blueprint);
    if (result) {
      return { ...result, summary: rule.summary };
    }
  }
  return null;
}

export function mergeFileUpdates(
  existing: AgentAppBlueprint,
  updates: Map<string, string>
): AgentAppBlueprint {
  const knownPaths = new Set(existing.files.map((f) => f.path));
  const mergedFiles = existing.files.map((f) => {
    const updated = updates.get(f.path);
    return updated !== undefined ? { ...f, code: updated } : f;
  });
  for (const [path, code] of updates) {
    if (!knownPaths.has(path)) {
      mergedFiles.push({
        path,
        code,
        language: path.endsWith(".css") ? "css" : "typescript",
        description: path,
      });
    }
  }
  return { ...existing, files: mergedFiles };
}

/**
 * Apply a search/replace edit. Falls back to whitespace-tolerant line matching
 * when the exact string isn't found (models often mangle indentation).
 */
export function applySearchReplace(
  code: string,
  search: string,
  replace: string
): string | null {
  if (search.length === 0) return null;
  if (code.includes(search)) {
    return code.replace(search, replace);
  }

  // Whitespace-tolerant fallback: match a window of lines comparing trimmed content
  const codeLines = code.split("\n");
  const searchLines = search
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, arr) => !(l === "" && (i === 0 || i === arr.length - 1)));
  if (searchLines.length === 0) return null;

  for (let i = 0; i <= codeLines.length - searchLines.length; i++) {
    let match = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (codeLines[i + j].trim() !== searchLines[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      const next = [
        ...codeLines.slice(0, i),
        ...replace.split("\n"),
        ...codeLines.slice(i + searchLines.length),
      ];
      return next.join("\n");
    }
  }

  return null;
}

/** Strip markdown code fences LLMs sometimes wrap around file content. */
export function normalizeLlmCode(raw: string): string {
  let code = raw.trim();
  const fence = code.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
  if (fence) code = fence[1];
  return code;
}
