/**
 * Convert highlight.js HTML (escaped text + span tokens) into React nodes
 * without using dangerouslySetInnerHTML.
 *
 * Only `span` elements with a safe `class` attribute and text nodes are allowed.
 */

import { createElement, type ReactNode } from "react";

const CLASS_RE = /^[a-zA-Z0-9_\- ]+$/;

type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; className: string }
  | { kind: "close" };

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function tokenizeHljsHtml(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith("</span>", i)) {
      tokens.push({ kind: "close" });
      i += 7;
      continue;
    }
    if (html.startsWith("<span", i)) {
      const close = html.indexOf(">", i);
      if (close === -1) {
        tokens.push({ kind: "text", value: html.slice(i) });
        break;
      }
      const tag = html.slice(i, close + 1);
      const classMatch = /\bclass="([^"]*)"/.exec(tag);
      const className = classMatch?.[1] ?? "";
      if (className && !CLASS_RE.test(className)) {
        tokens.push({ kind: "text", value: tag });
      } else {
        tokens.push({ kind: "open", className });
      }
      i = close + 1;
      continue;
    }
    const next = html.indexOf("<", i);
    if (next === -1) {
      tokens.push({ kind: "text", value: decodeBasicEntities(html.slice(i)) });
      break;
    }
    if (next > i) {
      tokens.push({ kind: "text", value: decodeBasicEntities(html.slice(i, next)) });
    }
    if (next === i) {
      const close = html.indexOf(">", i);
      if (close === -1) {
        tokens.push({ kind: "text", value: html.slice(i) });
        break;
      }
      tokens.push({ kind: "text", value: html.slice(i, close + 1) });
      i = close + 1;
    } else {
      i = next;
    }
  }
  return tokens;
}

/** Render highlight.js HTML as React children (no raw HTML sink). */
export function renderHljsHtml(html: string): ReactNode {
  const tokens = tokenizeHljsHtml(html);
  let key = 0;

  function build(start: number): { nodes: ReactNode[]; next: number } {
    const nodes: ReactNode[] = [];
    let i = start;
    while (i < tokens.length) {
      const t = tokens[i]!;
      if (t.kind === "text") {
        if (t.value) nodes.push(t.value);
        i += 1;
        continue;
      }
      if (t.kind === "close") {
        return { nodes, next: i + 1 };
      }
      const child = build(i + 1);
      nodes.push(
        createElement(
          "span",
          { key: `h${key++}`, className: t.className || undefined },
          child.nodes.length === 1 ? child.nodes[0] : child.nodes
        )
      );
      i = child.next;
    }
    return { nodes, next: i };
  }

  const { nodes } = build(0);
  return nodes.length === 1 ? nodes[0] : nodes;
}
