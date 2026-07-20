"use client";

import { useMemo, useState } from "react";
import {
  ensureOpenApiAuth,
  injectOpenApiAuthIntoUrl,
  substituteSnippetPlaceholders,
} from "@/lib/credential-placeholders";
import { applyRuntimeBaseUrl, rewriteUrlWithRuntimeBase } from "@/lib/snippet-base-url";
import { runJsInSandbox } from "@/lib/js-sandbox";
import { isPostmanPreRequestScript } from "@/lib/parse-request";
import { proxyHttpRequest } from "@/lib/http-run";
import type { CredField } from "@/lib/resolve-request";
import { maskText } from "@/lib/security";
import type { CodeSnippet } from "@/lib/types";
import { PyodideRunner } from "./PyodideRunner";
import { HttpRunner } from "./http-runner";
import { buildPlaygroundExec, useRequestPlayground } from "./RequestPlayground";
import { useRunSettings } from "./RunSettings";
import {
  CheckIcon,
  formatMaybeJson,
  PlayIcon,
  Pre,
  ResultBox,
  RunButton,
  type HttpResult,
} from "./runners-shared";

function JsonRunner({ code }: { code: string }) {
  const [status, setStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [output, setOutput] = useState("");

  function validate() {
    try {
      const parsed = JSON.parse(code);
      setOutput(JSON.stringify(parsed, null, 2));
      setStatus("valid");
    } catch (e) {
      setOutput(e instanceof Error ? e.message : "Invalid JSON.");
      setStatus("invalid");
    }
  }

  return (
    <div>
      <div className="mt-2">
        <RunButton onClick={validate} tone="ghost">
          <CheckIcon />
          Validate / Format JSON
        </RunButton>
      </div>
      {status === "valid" ? (
        <ResultBox tone="success" title="Valid JSON — formatted">
          <Pre text={output} />
        </ResultBox>
      ) : null}
      {status === "invalid" ? (
        <ResultBox tone="error" title="Invalid JSON">
          <Pre text={output} />
        </ResultBox>
      ) : null}
    </div>
  );
}

/* ----------------------------- JavaScript -------------------------------- */

function JsRunner({ code }: { code: string }) {
  const {
    baseUrl,
    secretValues,
    getCredential,
    ensureFreshAuth,
  } = useRunSettings();
  const playground = useRequestPlayground();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [httpResult, setHttpResult] = useState<HttpResult | null>(null);

  const jsCredFields = useMemo(() => {
    if (playground) return playground.credFields;
    const fields: CredField[] = [
      { name: "AccessID", example: "<your access id>" },
      { name: "Signature", example: "<generated signature>" },
      { name: "Expires", example: "<unix expiry>" },
    ];
    return fields;
  }, [playground]);

  function prepareCode(): string {
    let out = substituteSnippetPlaceholders(code, getCredential);
    out = applyRuntimeBaseUrl(out, baseUrl);
    out = out.replace(/const url = "([^"]+)"/g, (_m, rawUrl: string) => {
      let u = rewriteUrlWithRuntimeBase(rawUrl, baseUrl);
      u = injectOpenApiAuthIntoUrl(u, getCredential);
      return `const url = ${JSON.stringify(u)}`;
    });
    return out;
  }

  async function runViaPlayground() {
    const validationError = playground!.validateForRun();
    if (validationError) throw new Error(validationError);

    const authErr = await ensureOpenApiAuth(
      playground!.credFields,
      getCredential,
      ensureFreshAuth
    );
    if (authErr) throw new Error(authErr);

    const exec = buildPlaygroundExec(playground!, baseUrl, getCredential);
    const data = await proxyHttpRequest(await exec);
    setHttpResult(data);
    setLogs([`${data.status} ${data.statusText}`]);
    setResult(formatMaybeJson(data.body));
  }

  async function run() {
    setBusy(true);
    setDone(false);
    setError(undefined);
    setResult(undefined);
    setHttpResult(null);
    setLogs([]);

    try {
      if (playground) {
        await runViaPlayground();
      } else {
        const authErr = await ensureOpenApiAuth(
          jsCredFields,
          getCredential,
          ensureFreshAuth
        );
        if (authErr) throw new Error(authErr);

        const r = await runJsInSandbox(prepareCode(), {
          baseUrl,
          secretValues,
          getCredential,
        });
        setLogs(r.logs || []);
        setResult(r.result);
        if (r.error) setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed.");
    } finally {
      setDone(true);
      setBusy(false);
    }
  }

  return (
    <div>
      {playground ? (
        <p className="mt-1 text-[11px] opacity-60">
          Uses values from <strong>Request parameters</strong> above.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <RunButton onClick={run} busy={busy}>
          <PlayIcon />
          {busy ? "Running…" : playground ? "Run" : "Run (sandboxed)"}
        </RunButton>
        <span className="text-[11px] opacity-50">
          {playground
            ? "Sends the resolved request via server proxy"
            : "Sandboxed iframe · API calls proxied server-side"}
        </span>
      </div>
      {done ? (
        <ResultBox tone={error ? "error" : httpResult && !httpResult.ok ? "error" : "success"} title={playground && httpResult ? "Response" : "Console output"}>
          {httpResult ? (
            <div className="mb-2 font-mono text-xs">
              <span
                className={`font-semibold ${httpResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
              >
                {httpResult.status} {httpResult.statusText}
              </span>
              {typeof httpResult.durationMs === "number" ? (
                <span className="opacity-50"> · {httpResult.durationMs} ms</span>
              ) : null}
            </div>
          ) : null}
          {logs.length > 0 ? (
            <Pre text={maskText(logs.join("\n"), secretValues)} />
          ) : null}
          {result !== undefined ? (
            <div className="mt-1">
              {playground ? null : (
                <span className="text-[11px] opacity-60">return value: </span>
              )}
              <Pre text={maskText(result, secretValues)} />
            </div>
          ) : null}
          {error ? (
            <div className="mt-1 text-red-600 dark:text-red-400">
              <Pre text={maskText(error, secretValues)} />
            </div>
          ) : null}
          {logs.length === 0 && result === undefined && !error ? (
            <span className="text-xs opacity-60">No output.</span>
          ) : null}
        </ResultBox>
      ) : null}
    </div>
  );
}

/* ------------------------------- Shell ----------------------------------- */

function ShellNote() {
  return (
    <p className="mt-2 text-[11px] opacity-60">
      Shell commands can&apos;t be run from the browser. Use the cURL tab for the
      equivalent runnable request, or copy this snippet to your terminal.
    </p>
  );
}

function PostmanScriptNote() {
  return (
    <div className="mt-2 rounded-md border border-sky-400/40 bg-sky-50/50 p-3 text-[11px] text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
      <strong>Postman only.</strong> This pre-request script uses Postman&apos;s{" "}
      <code className="font-mono">pm</code> API and cannot run in the browser. Open{" "}
      <strong>API Settings</strong> in the header, enter your Access ID and Secret Key once —
      Signature and Expires are generated automatically when you click <strong>Run</strong> on
      any HTTP endpoint snippet.
    </div>
  );
}

/* ------------------------------ dispatcher ------------------------------- */

export function SnippetRunner({ snippet }: { snippet: CodeSnippet }) {
  switch (snippet.runKind) {
    case "http":
      return <HttpRunner code={snippet.code} request={snippet.request} />;
    case "json":
      return <JsonRunner code={snippet.code} />;
    case "javascript":
      return <JsRunner code={snippet.code} />;
    case "python":
      return <PyodideRunner code={snippet.code} />;
    case "none":
      if (isPostmanPreRequestScript(snippet.code)) return <PostmanScriptNote />;
      if (/^(bash|sh|shell|zsh)$/i.test(snippet.lang)) return <ShellNote />;
      return null;
    default:
      return null;
  }
}
