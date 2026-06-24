"use client";

import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github-dark.css";
import { useMemo, useState } from "react";
import type { CodeSnippet } from "@/lib/types";
import { applyRuntimeBaseUrl } from "@/lib/snippet-base-url";
import { SnippetRunner } from "./runners";
import { useRunSettings } from "./RunSettings";

const LANG_MAP: Record<string, string> = {
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  curl: "bash",
  json: "json",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  python: "python",
  py: "python",
  http: "http",
  text: "plaintext",
};

function highlight(code: string, lang: string): string {
  const mapped = LANG_MAP[lang.toLowerCase()] || lang.toLowerCase();
  try {
    if (mapped && hljs.getLanguage(mapped)) {
      return hljs.highlight(code, { language: mapped }).value;
    }
  } catch {
    /* fall through */
  }
  try {
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function CodeBlock({ snippet }: { snippet: CodeSnippet }) {
  const [copied, setCopied] = useState(false);
  const { baseUrl } = useRunSettings();
  const displayCode = useMemo(
    () => applyRuntimeBaseUrl(snippet.code, baseUrl),
    [snippet.code, baseUrl]
  );
  const runnableSnippet = useMemo(
    () => ({ ...snippet, code: displayCode }),
    [snippet, displayCode]
  );
  // hljs escapes its input, so the produced markup is safe to inject.
  const html = useMemo(
    () => highlight(displayCode, snippet.lang),
    [displayCode, snippet.lang]
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(displayCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="not-prose my-4 overflow-hidden rounded-lg border border-zinc-800 bg-[#0d1117] text-zinc-100 shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          {snippet.label || snippet.lang}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Copy code"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <pre className="px-4 py-3 text-[13px] leading-relaxed">
          <code
            className={`hljs language-${snippet.lang}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </pre>
      </div>
      {snippet.runKind !== "none" ||
      /^(bash|sh|shell|zsh)$/i.test(snippet.lang) ? (
        <div className="border-t border-zinc-800 bg-zinc-950/40 px-3 py-2 text-zinc-200">
          <SnippetRunner snippet={runnableSnippet} />
        </div>
      ) : null}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
