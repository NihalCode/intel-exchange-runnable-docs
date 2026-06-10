import type { AgentAppBlueprint } from "./types";
import { phishingGlobalsCss } from "./app-builder";

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

function detectAppFeatures(blueprint: AgentAppBlueprint): { theme: boolean; upload: boolean } {
  const page = blueprint.files.find((f) => f.path === "app/page.tsx")?.code ?? "";
  return {
    theme: /agent:theme-switcher|cyware-theme|theme-toggle/.test(page),
    upload: /agent:file-upload|handleUploadFiles|extractUploadText|handleFiles/.test(page),
  };
}

function rebuildGlobalsCss(blueprint: AgentAppBlueprint): string {
  const features = detectAppFeatures(blueprint);
  return phishingGlobalsCss({ theme: features.theme, uploadList: features.upload });
}

function patchThemeLayout(code: string): string | null {
  if (code.includes('data-theme="dark"')) return null;
  const next = code.replace(
    /<html lang="en">/,
    '<html lang="en" data-theme="dark" suppressHydrationWarning>'
  );
  return next !== code ? next : null;
}

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

  const hasTheme = /agent:theme-switcher|cyware-theme/.test(nextPage);
  const changedPaths = ["app/page.tsx"];
  const files = blueprint.files.map((f) => {
    if (f.path === "app/page.tsx") return { ...f, code: nextPage };
    if (f.path === "app/globals.css") {
      changedPaths.push(f.path);
      return {
        ...f,
        code: phishingGlobalsCss({ theme: hasTheme, uploadList: true }),
      };
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

  const hasTheme = /agent:theme-switcher|cyware-theme/.test(page.code);
  const nextPage = patchThemeSwitcherPage(page.code);
  const layout = blueprint.files.find((f) => f.path === "app/layout.tsx");
  const nextLayout = layout ? patchThemeLayout(layout.code) : null;

  const globals = blueprint.files.find((f) => f.path === "app/globals.css");
  const needsCssRebuild =
    !!globals &&
    (!globals.code.includes(".card {") ||
      !globals.code.includes("agent:theme-switcher") ||
      globals.code.length < 2000);

  if (nextPage === null && !needsCssRebuild && !nextLayout) return null;
  if (nextPage === null && !hasTheme && !needsCssRebuild) return null;

  const changedPaths: string[] = [];
  const files = blueprint.files.map((f) => {
    if (f.path === "app/page.tsx" && nextPage) {
      changedPaths.push(f.path);
      return { ...f, code: nextPage };
    }
    if (f.path === "app/layout.tsx" && nextLayout) {
      changedPaths.push(f.path);
      return { ...f, code: nextLayout };
    }
    if (f.path === "app/globals.css" && (nextPage || needsCssRebuild)) {
      changedPaths.push(f.path);
      const pageCode = nextPage ?? page.code;
      const upload = /agent:file-upload|handleUploadFiles|handleFiles/.test(pageCode);
      return {
        ...f,
        code: phishingGlobalsCss({ theme: true, uploadList: upload }),
      };
    }
    return f;
  });

  if (changedPaths.length === 0) return null;

  return {
    blueprint: { ...blueprint, files },
    summary: "Added theme switcher",
    changedPaths,
  };
}

function repairUiFeature(blueprint: AgentAppBlueprint): EditResult | null {
  const globals = blueprint.files.find((f) => f.path === "app/globals.css");
  if (!globals) return null;

  const features = detectAppFeatures(blueprint);
  const rebuiltCss = phishingGlobalsCss({ theme: features.theme, uploadList: features.upload });
  const layout = blueprint.files.find((f) => f.path === "app/layout.tsx");
  const nextLayout = features.theme && layout ? patchThemeLayout(layout.code) : null;

  const changedPaths = ["app/globals.css"];
  const files = blueprint.files.map((f) => {
    if (f.path === "app/globals.css") return { ...f, code: rebuiltCss };
    if (f.path === "app/layout.tsx" && nextLayout) {
      changedPaths.push(f.path);
      return { ...f, code: nextLayout };
    }
    return f;
  });

  return {
    blueprint: { ...blueprint, files },
    summary: "Restored complete UI stylesheet",
    changedPaths,
  };
}

const RULES: {
  test: (q: string) => boolean;
  apply: (blueprint: AgentAppBlueprint) => EditResult | null;
  summary: string;
}[] = [
  {
    test: (q) =>
      /fix.*ui|restore.*styl|broken ui|fix css|fix theme|build.*broke|npm run build|ui broke|stylesheet/i.test(
        q
      ),
    summary:
      "Restored the complete UI stylesheet (base layout + cards + buttons + theme/upload styles) so the app builds and renders correctly.",
    apply: repairUiFeature,
  },
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
