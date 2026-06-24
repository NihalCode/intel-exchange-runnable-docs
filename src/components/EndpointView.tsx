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
  GET: "bg-emerald-600",
  POST: "bg-sky-600",
  PUT: "bg-amber-600",
  PATCH: "bg-violet-600",
  DELETE: "bg-red-600",
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold text-white ${METHOD_COLORS[method] || "bg-zinc-600"}`}
    >
      {method}
    </span>
  );
}

function ParamTable({ title, fields }: { title: string; fields?: ParamField[] }) {
  if (!fields || fields.length === 0) return null;
  return (
    <section className="my-5">
      <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {title}
      </h3>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
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
                className="border-t border-zinc-100 align-top dark:border-zinc-800"
              >
                <td className="px-3 py-2 font-mono text-xs font-semibold">{f.name}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">
                  {f.valueType || "string"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {f.isRequired ? (
                    <span className="font-medium text-red-600 dark:text-red-400">
                      required
                    </span>
                  ) : (
                    <span className="text-zinc-400">optional</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0">
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
    <article className="mx-auto max-w-4xl">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ProductBadge productId={productId} />
        <MethodBadge method={page.method} />
        <h1 className="text-2xl font-bold tracking-tight">{page.title}</h1>
        {docsUrl ? (
          <a href={docsUrl} className="text-xs text-sky-600 underline" target="_blank" rel="noreferrer">
            Source docs
          </a>
        ) : null}
      </div>

      <div className="mb-5 flex items-center gap-2 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <MethodBadge method={page.method} />
        <span className="whitespace-nowrap text-zinc-500">{displayBase}</span>
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

      <section className="mt-8">
        <h2 className="mb-1 text-lg font-semibold">Run it</h2>
        <p className="mb-3 text-sm text-zinc-500">
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
