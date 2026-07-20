/**
 * Syntax-highlight source into React text/span nodes without any raw-HTML sink.
 * Walks highlight.js's token tree (`_emitter` root) — never parses or injects HTML.
 */

import { createElement, type ReactNode } from "react";
import hljs from "highlight.js/lib/common";

const CLASS_PREFIX = "hljs-";
const CLASS_RE = /^[a-zA-Z0-9_\- ]+$/;

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
  plaintext: "plaintext",
};

type TokenNode = string | { scope?: string; language?: string; children: TokenNode[] };

type EmitterRoot = {
  root?: TokenNode;
  rootNode?: TokenNode;
};

function scopeToSafeClass(scope: string): string | undefined {
  let className: string;
  if (scope.startsWith("language:")) {
    className = scope.replace("language:", "language-");
  } else if (scope.includes(".")) {
    const pieces = scope.split(".");
    const head = pieces.shift()!;
    className = [
      `${CLASS_PREFIX}${head}`,
      ...pieces.map((x, i) => `${x}${"_".repeat(i + 1)}`),
    ].join(" ");
  } else {
    className = `${CLASS_PREFIX}${scope}`;
  }
  if (!CLASS_RE.test(className)) return undefined;
  return className;
}

function renderTokenNode(node: TokenNode, keyBase: { n: number }): ReactNode {
  if (typeof node === "string") {
    return node;
  }
  const childNodes: ReactNode[] = [];
  for (const child of node.children ?? []) {
    const rendered = renderTokenNode(child, keyBase);
    if (rendered === null || rendered === undefined || rendered === "") continue;
    childNodes.push(rendered);
  }
  if (!node.scope) {
    return childNodes.length === 1 ? childNodes[0] : childNodes;
  }
  const className = scopeToSafeClass(node.scope);
  const key = `t${keyBase.n++}`;
  return createElement(
    "span",
    { key, className },
    childNodes.length === 1 ? childNodes[0] : childNodes
  );
}

function emitterRoot(result: { _emitter?: unknown }): TokenNode | null {
  const emitter = result._emitter as EmitterRoot | undefined;
  if (!emitter) return null;
  return emitter.root ?? emitter.rootNode ?? null;
}

function resolveLanguage(lang: string): string | null {
  const mapped = LANG_MAP[lang.toLowerCase()] || lang.toLowerCase();
  if (mapped && hljs.getLanguage(mapped)) return mapped;
  return null;
}

/** Flatten token tree back to the original source text (for copy/equality checks). */
export function flattenHighlightText(node: TokenNode): string {
  if (typeof node === "string") return node;
  return (node.children ?? []).map(flattenHighlightText).join("");
}

/** Highlight source code into React nodes (text + safe span tokens only). */
export function highlightToReact(code: string, lang: string): ReactNode {
  try {
    const language = resolveLanguage(lang);
    const result = language
      ? hljs.highlight(code, { language })
      : hljs.highlightAuto(code);
    const root = emitterRoot(result);
    if (!root) return code;
    if (typeof root === "string") return root;
    return renderTokenNode(root, { n: 0 });
  } catch {
    return code;
  }
}
