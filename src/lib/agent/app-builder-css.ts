/* ─────────────────────────── globals CSS ──────────────────────────── */

function globalsCss(): string {
  return `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f8fafc;
  color: #1e293b;
  line-height: 1.6;
  min-height: 100vh;
}

.container { max-width: 960px; margin: 0 auto; padding: 2rem 1rem; }

h1 { font-size: 1.875rem; font-weight: 700; letter-spacing: -0.025em; margin-bottom: 0.375rem; }
h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.75rem; }
h3 { font-size: 0.9375rem; font-weight: 600; margin-bottom: 0.5rem; }

.subtitle { color: #64748b; margin-bottom: 2rem; max-width: 600px; }

.card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

textarea, input[type="text"] {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: 0.8125rem;
  resize: vertical;
  background: #f8fafc;
  transition: border-color 0.15s;
  margin-bottom: 1rem;
}
textarea:focus, input:focus { outline: none; border-color: #3b82f6; background: #fff; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }

.btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 1.125rem; border-radius: 8px;
  font-weight: 600; font-size: 0.875rem; border: none; cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  text-decoration: none;
}
.btn:active:not(:disabled) { transform: scale(0.98); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-primary { background: #3b82f6; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #2563eb; }
.btn-danger { background: #ef4444; color: #fff; }
.btn-danger:hover:not(:disabled) { background: #dc2626; }
.btn-ghost { background: transparent; color: #475569; border: 1.5px solid #e2e8f0; }
.btn-ghost:hover:not(:disabled) { background: #f1f5f9; }
.btn-sm { padding: 0.3rem 0.75rem; font-size: 0.8125rem; }

.toolbar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }

.badge { display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.badge-blue { background: #eff6ff; color: #1d4ed8; }
.badge-green { background: #f0fdf4; color: #166534; }
.badge-red { background: #fff1f2; color: #9f1239; }
.badge-amber { background: #fffbeb; color: #92400e; }
.badge-gray { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }

.table-wrapper { overflow-x: auto; border-radius: 8px; border: 1px solid #e2e8f0; }
table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
th { background: #f8fafc; text-align: left; padding: 0.625rem 0.875rem; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; font-weight: 600; border-bottom: 1.5px solid #e2e8f0; white-space: nowrap; }
td { padding: 0.625rem 0.875rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: #f8fafc; }

.row-found td { background: #f0fdf4 !important; }
.row-not-found td { background: #fff1f2 !important; }

.type-cell { font-weight: 500; color: #475569; font-size: 0.8125rem; }
.value-cell { font-family: "SF Mono", monospace; font-size: 0.8125rem; color: #0f172a; word-break: break-all; max-width: 280px; }
.id-cell { font-family: monospace; font-size: 0.75rem; color: #64748b; }

.status-found { color: #166534; font-weight: 600; }
.status-not-found { color: #9f1239; font-weight: 500; }
.status-checking { color: #2563eb; }
.status-pending { color: #94a3b8; }

.risk-score-cell { min-width: 120px; }
.risk-score-value { font-weight: 700; font-size: 0.875rem; color: var(--text-primary, #0f172a); }
.risk-score-bar {
  margin-top: 0.25rem; height: 6px; border-radius: 9999px;
  background: var(--border-subtle, #e2e8f0); overflow: hidden;
}
.risk-score-fill { height: 100%; border-radius: 9999px; background: linear-gradient(90deg, #19C99A, #f59e0b, #ef4444); }
.risk-score-na { color: var(--text-muted, #64748b); font-size: 0.8125rem; }

.upload-zone {
  display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  padding: 0.875rem 1rem; margin-bottom: 1rem;
  border: 1.5px dashed var(--border-subtle, #cbd5e1); border-radius: 10px;
  background: var(--surface-subtle, #f8fafc);
  color: var(--text-muted, #64748b); font-size: 0.8125rem; text-align: center;
  cursor: pointer; transition: border-color 0.15s, background 0.15s;
}
.upload-zone:hover { border-color: #3b82f6; background: var(--surface-hover, #eff6ff); }
.upload-files { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }

.alert { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }
.alert-error { background: #fff1f2; border: 1px solid #fecdd3; color: #9f1239; }
.alert-info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }

.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.summary-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem; text-align: center; }
.summary-number { font-size: 2rem; font-weight: 700; line-height: 1; margin-bottom: 0.25rem; }
.summary-label { font-size: 0.75rem; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }

.spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: currentColor; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;
}

/** Known-good stylesheet for generated apps — used to recover broken CSS at deploy. */
export function defaultGlobalsCss(): string {
  return globalsCss();
}

/** Extra upload-list styles injected by the file-upload rule (not in the base template). */
export function uploadListCss(): string {
  return `
.upload-list { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-direction: column; gap: 0.375rem; }
.upload-item {
  display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
  font-size: 0.8125rem; padding: 0.5rem 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 8px;
}
.upload-name { font-weight: 600; word-break: break-all; }
.upload-meta { color: var(--text-muted, #64748b); }
.upload-status { margin-left: auto; }
.upload-done .upload-status { color: #19c99a; }
.upload-error .upload-status { color: #ef4444; }
`;
}

/** Theme switcher styles — always paired with the full base stylesheet, never used alone. */
export function themeSwitcherCss(): string {
  return `
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
.upload-zone {
  border-color: var(--border-subtle); background: rgba(148, 163, 184, 0.08); color: var(--text-muted);
}
.upload-zone:hover { border-color: #3b82f6; background: var(--surface-hover); }
`;
}

/** Rebuild a complete globals.css for apps with optional upload + theme features. */
export function phishingGlobalsCss(opts?: { theme?: boolean; uploadList?: boolean }): string {
  let css = globalsCss();
  if (opts?.uploadList) css += uploadListCss();
  if (opts?.theme) css += themeSwitcherCss();
  return css;
}

/** Full base + theme stylesheet — use this instead of appending theme CSS to a broken file. */
export function themeAwareGlobalsCss(): string {
  return phishingGlobalsCss({ theme: true, uploadList: true });
}
