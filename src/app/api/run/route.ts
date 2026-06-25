import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";
import { buildDemoResponse, shouldSimulateRequest } from "@/lib/demo";
import type { MultipartPart } from "@/lib/multipart";
import { MAX_UPLOAD_BYTES } from "@/lib/multipart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 2_000_000; // 2 MB response cap

interface RunBody {
  method?: string;
  url?: string;
  headers?: { name: string; value: string }[];
  body?: string;
  multipartParts?: MultipartPart[];
  /** When true, return a simulated JSON response (docs clone / no tenant). */
  demo?: boolean;
}

const ALLOWED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".local")
  ) {
    throw new Error("Requests to local/internal hosts are blocked.");
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Requests to private IPs are blocked.");
    return;
  }
  let records: { address: string }[] = [];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`Could not resolve host: ${hostname}`);
  }
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new Error("Host resolves to a private IP and is blocked.");
    }
  }
}

export async function POST(request: Request) {
  let payload: RunBody;
  try {
    payload = (await request.json()) as RunBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const method = (payload.method || "GET").toUpperCase();
  const urlStr = payload.url || "";

  if (!ALLOWED_METHODS.has(method)) {
    return NextResponse.json({ error: `Method ${method} not allowed.` }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlStr);
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only http and https protocols are supported." },
      { status: 400 }
    );
  }

  if (shouldSimulateRequest(urlStr, payload.demo)) {
    return NextResponse.json(
      buildDemoResponse(method, urlStr, payload.body)
    );
  }

  if (process.env.ENABLE_API_EXECUTION !== "true") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Live API execution is disabled on this server. Documentation and placeholder examples are available without credentials. Enable ENABLE_API_EXECUTION=true for developer testing.",
      },
      { status: 403 }
    );
  }

  try {
    await assertPublicHost(target.hostname);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Blocked host." },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();

  try {
    const outboundBody = await buildOutboundBody(method, payload);
    const res = await fetch(target.toString(), {
      method,
      headers: outboundBody.headers,
      body: outboundBody.body,
      redirect: "follow",
      signal: controller.signal,
    });

    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          received += value.byteLength;
          if (received > MAX_BYTES) {
            controller.abort();
            break;
          }
          chunks.push(value);
        }
      }
    }
    const bodyText = new TextDecoder().decode(concat(chunks));

    const respHeaders: { name: string; value: string }[] = [];
    res.headers.forEach((value, name) => respHeaders.push({ name, value }));

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: respHeaders,
      body: bodyText,
      truncated: received > MAX_BYTES,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        error: aborted
          ? `Request timed out after ${TIMEOUT_MS / 1000}s (or exceeded size limit).`
          : err instanceof Error
            ? err.message
            : "Request failed.",
        durationMs: Date.now() - started,
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

async function buildOutboundBody(
  method: string,
  payload: RunBody
): Promise<{ headers: Headers; body: BodyInit | undefined }> {
  const headers = new Headers();
  for (const h of payload.headers || []) {
    if (!h?.name) continue;
    if (/^(host|content-length|connection)$/i.test(h.name)) continue;
    if (payload.multipartParts?.length && h.name.toLowerCase() === "content-type") continue;
    try {
      headers.set(h.name, h.value ?? "");
    } catch {
      /* ignore invalid header names */
    }
  }

  if (method === "GET" || method === "HEAD") {
    return { headers, body: undefined };
  }

  if (payload.multipartParts?.length) {
    const form = new FormData();
    let totalBytes = 0;
    for (const part of payload.multipartParts) {
      if (part.kind === "file") {
        if (!part.dataBase64) continue;
        const buf = Buffer.from(part.dataBase64, "base64");
        totalBytes += buf.byteLength;
        if (totalBytes > MAX_UPLOAD_BYTES) {
          throw new Error(`Upload exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit.`);
        }
        const blob = new Blob([buf], { type: part.contentType || "application/octet-stream" });
        form.append(part.name, blob, part.filename || "upload");
      } else if (part.value !== undefined) {
        form.append(part.name, part.value);
      }
    }
    return { headers, body: form };
  }

  return { headers, body: payload.body };
}
