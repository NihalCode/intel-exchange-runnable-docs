import type { DocPage, EndpointPage, ParamField, SectionPage } from "../types";
import type { AgentChunk, AgentChunkKind } from "./types";

function flattenParamNames(fields: ParamField[] | undefined, prefix = ""): string[] {
  if (!fields) return [];
  const names: string[] = [];
  for (const f of fields) {
    if (!f.name) continue;
    const full = prefix ? `${prefix}.${f.name}` : f.name;
    names.push(full);
    if (f.complexItems?.length) {
      names.push(...flattenParamNames(f.complexItems, full));
    }
  }
  return names;
}

function describeParams(fields: ParamField[] | undefined, label: string): string {
  if (!fields?.length) return "";
  const lines = fields
    .filter((f) => f.name)
    .map((f) => {
      const req = f.isRequired ? "required" : "optional";
      const desc = f.description?.trim() || "";
      return `- ${f.name} (${req}${f.valueType ? `, ${f.valueType}` : ""})${desc ? `: ${desc}` : ""}`;
    });
  return `${label}:\n${lines.join("\n")}`;
}

function chunkId(slug: string, kind: AgentChunkKind): string {
  return `${slug}::${kind}`;
}

export function chunkEndpoint(page: EndpointPage): AgentChunk {
  const parts = [
    page.title,
    page.breadcrumb.join(" > "),
    `${page.method} ${page.path}`,
    page.description?.trim() || "",
    describeParams(page.request?.path, "Path parameters"),
    describeParams(page.request?.query, "Query parameters"),
    describeParams(page.request?.header, "Headers"),
    describeParams(page.request?.body, "Body fields"),
  ].filter(Boolean);

  return {
    id: chunkId(page.slug, "endpoint"),
    slug: page.slug,
    title: page.title,
    kind: "endpoint",
    method: page.method,
    path: page.path,
    breadcrumb: page.breadcrumb,
    text: parts.join("\n\n"),
  };
}

export function chunkSection(page: SectionPage): AgentChunk {
  const md = page.markdown?.trim() || "";
  const excerpt = md.length > 1200 ? `${md.slice(0, 1200)}…` : md;

  return {
    id: chunkId(page.slug, "section"),
    slug: page.slug,
    title: page.title,
    kind: "section",
    breadcrumb: page.breadcrumb,
    text: [page.title, page.breadcrumb.join(" > "), excerpt].filter(Boolean).join("\n\n"),
  };
}

export function chunkPage(page: DocPage): AgentChunk | null {
  if (page.kind === "endpoint") return chunkEndpoint(page);
  if (page.kind === "section" && page.markdown?.trim()) return chunkSection(page);
  return null;
}
