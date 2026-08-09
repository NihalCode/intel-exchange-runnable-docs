"use client";

import { useMemo } from "react";
import type { CodeSnippet, EndpointPage, ParamField } from "@/lib/types";
import { useRunSettings } from "./RunSettings";
import { ProductBadge } from "./ProductContext";
import { buildRunnableRequest } from "@/lib/snippets";
import { getProduct } from "@/lib/products/registry";
import { CodeBlock } from "./CodeBlock";
import { Markdown } from "./Markdown";
import { RequestPlaygroundPanel, RequestPlaygroundProvider } from "./RequestPlayground";

function MethodBadge({ method }: { method: string }) {
  return <span className="atlas-method">{method}</span>;
}

function ParamTable({ title, fields }: { title: string; fields?: ParamField[] }) {
  if (!fields || fields.length === 0) return null;
  return (
    <section className="my-5">
      <h3 className="mb-2 text-sm font-semibold text-[var(--text-heading)]">
        {title}
      </h3>
      <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border-default)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-sunken)]">
            <tr>
              <th className="px-3 py-2">
                <span className="atlas-micro-label">Name</span>
              </th>
              <th className="px-3 py-2">
                <span className="atlas-micro-label">Type</span>
              </th>
              <th className="px-3 py-2">
                <span className="atlas-micro-label">Required</span>
              </th>
              <th className="px-3 py-2">
                <span className="atlas-micro-label">Description</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr
                key={`${f.name}-${i}`}
                className="border-t border-[var(--border-subtle)] align-top"
              >
                <td className="px-3 py-2 font-mono text-xs font-semibold">{f.name}</td>
                <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                  {f.valueType || "string"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {f.isRequired ? (
                    <span className="font-medium text-[var(--danger)]">required</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">optional</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                  <div className="prose prose-sm prose-cyware max-w-none prose-p:my-0">
                    <Markdown>{f.description || ""}</Markdown>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function EndpointView({
  page,
  snippets,
  productId = "ctix",
  docsUrl,
}: {
  page: EndpointPage;
  snippets: CodeSnippet[];
  productId?: string;
  docsUrl?: string;
}) {
  const { baseUrl } = useRunSettings();
  const product = getProduct(productId);
  const displayBase = baseUrl || product?.baseApiUrl || "";
  const runnableRequest = useMemo(() => buildRunnableRequest(page, productId), [page, productId]);

  return (
    <article className="mx-auto max-w-[var(--content-max)]" data-layout="sf-endpoint-explorer">
      <div className="atlas-endpoint-meta">
        <ProductBadge productId={productId} />
        <MethodBadge method={page.method} />
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-heading)]">
          {page.title}
        </h1>
        {docsUrl ? (
          <a
            href={docsUrl}
            className="text-xs text-[var(--text-link)] underline"
            target="_blank"
            rel="noreferrer"
          >
            Source docs
          </a>
        ) : null}
      </div>

      <div className="atlas-code-deck mb-5 flex items-center gap-2 overflow-x-auto px-3 py-2.5 font-mono text-sm">
        <MethodBadge method={page.method} />
        <span className="whitespace-nowrap opacity-55">{displayBase}</span>
        <span className="whitespace-nowrap font-semibold">
          {page.path.startsWith("/") ? page.path : `/${page.path}`}
        </span>
      </div>

      {page.description ? (
        <div className="mb-6">
          <Markdown>{page.description}</Markdown>
        </div>
      ) : null}

      <ParamTable title="Path Parameters" fields={page.request?.path} />
      <ParamTable title="Query Parameters" fields={page.request?.query} />
      <ParamTable title="Headers" fields={page.request?.header} />
      <ParamTable title="Body Parameters" fields={page.request?.body} />

      <section className="atlas-panel mt-8">
        <div className="atlas-panel__header">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-heading)]">Run it</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Use the <strong>Request parameters</strong> panel to enter path IDs, query values, JSON
              body, and credentials. Then run any snippet below — all languages use the same values.
              Base URL: <code className="font-mono text-xs">{displayBase}</code> (change in API
              Settings).
            </p>
          </div>
        </div>
        <div className="space-y-3 p-3">
          <RequestPlaygroundProvider
            request={runnableRequest}
            storageId={page.slug}
            meta={{
              pathFields: page.request?.path,
              queryFields: page.request?.query,
              bodyFields: page.request?.body,
            }}
          >
            <RequestPlaygroundPanel />
            {snippets.map((snippet, i) => (
              <CodeBlock key={`${snippet.label}-${i}`} snippet={snippet} />
            ))}
          </RequestPlaygroundProvider>
        </div>
      </section>
    </article>
  );
}
