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

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-700 dark:text-emerald-300",
  POST: "text-sky-700 dark:text-sky-300",
  PUT: "text-amber-700 dark:text-amber-300",
  PATCH: "text-violet-700 dark:text-violet-300",
  DELETE: "text-red-700 dark:text-red-300",
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`sf-method-badge ${METHOD_COLORS[method] || "text-[var(--text-muted)]"}`}
    >
      {method}
    </span>
  );
}

function ParamTable({ title, fields }: { title: string; fields?: ParamField[] }) {
  if (!fields || fields.length === 0) return null;
  return (
    <section className="my-5">
      <h3 className="mb-2 text-sm font-semibold text-[var(--text-heading)]">
        {title}
      </h3>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-default)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-sunken)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Required</th>
              <th className="px-3 py-2 font-medium">Description</th>
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
                    <span className="font-medium text-red-600 dark:text-red-400">
                      required
                    </span>
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
      <div className="sf-endpoint-identity">
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

      <div className="mb-5 flex items-center gap-2 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-code)] px-3 py-2.5 font-mono text-sm text-[#e5e7eb] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <MethodBadge method={page.method} />
        <span className="whitespace-nowrap text-white/55">{displayBase}</span>
        <span className="whitespace-nowrap font-semibold text-white">
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

      <section className="mt-8">
        <h2 className="mb-1 text-lg font-semibold text-[var(--text-heading)]">Run it</h2>
        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          Use the <strong>Request parameters</strong> panel to enter path IDs, query values, JSON
          body, and credentials. Then run any snippet below — all languages use the same values.
          Base URL: <code className="font-mono text-xs">{displayBase}</code> (change in API Settings).
        </p>
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
      </section>
    </article>
  );
}
