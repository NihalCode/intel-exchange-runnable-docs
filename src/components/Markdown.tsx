"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { classifyRunKind, detectLanguage } from "@/lib/parse-request";
import type { CodeSnippet } from "@/lib/types";
import { CodeBlock } from "./CodeBlock";

function labelFor(lang: string, code: string): string {
  switch (lang) {
    case "bash":
      return /\bcurl\b/.test(code) ? "cURL" : "Shell";
    case "json":
      return "JSON";
    case "javascript":
      return "JavaScript";
    case "typescript":
      return "TypeScript";
    case "python":
      return "Python";
    case "http":
      return "HTTP";
    default:
      return lang ? lang.toUpperCase() : "Code";
  }
}

function buildSnippet(rawLang: string | undefined, code: string): CodeSnippet {
  const lang = detectLanguage(code, rawLang);
  return {
    lang,
    label: labelFor(lang, code),
    code,
    runKind: classifyRunKind(lang, code),
  };
}

const components: Components = {
  pre({ children }) {
    return <>{children}</>;
  },
  code(props) {
    const { className, children } = props as {
      className?: string;
      children?: React.ReactNode;
    };
    const text = String(children ?? "").replace(/\n$/, "");
    const match = /language-(\w+)/.exec(className || "");
    const isBlock = !!match || text.includes("\n");
    if (isBlock) {
      return <CodeBlock snippet={buildSnippet(match?.[1], text)} />;
    }
    return (
      <code className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.85em] dark:bg-zinc-800">
        {children}
      </code>
    );
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-sky-600 underline decoration-sky-300 underline-offset-2 hover:text-sky-500 dark:text-sky-400"
      >
        {children}
      </a>
    );
  },
};

export function Markdown({ children }: { children: string }) {
  // Soften GitHub-style callout markers that GFM doesn't render specially.
  const normalized = children.replace(/\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]/g, "**$1**");
  return (
    <div className="prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-24 prose-pre:p-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
