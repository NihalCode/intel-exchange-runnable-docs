import type { ExecRequest } from "./parse-request";
import { withCsrfHeaders } from "./csrf-client";

export interface HttpProxyResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { name: string; value: string }[];
  body: string;
  truncated?: boolean;
  durationMs?: number;
}

export async function proxyHttpRequest(
  exec: ExecRequest,
  demo = false
): Promise<HttpProxyResult> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      method: exec.method,
      url: exec.url,
      headers: exec.headers,
      body: exec.body,
      multipartParts: exec.multipartParts,
      demo,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `Proxy error (HTTP ${res.status}).`);
  }
  return data as HttpProxyResult;
}

export function stripContentTypeHeader(headers: { name: string; value: string }[]): { name: string; value: string }[] {
  return headers.filter((h) => h.name.toLowerCase() !== "content-type");
}
