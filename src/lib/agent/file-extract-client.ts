"use client";

/**
 * Client-side text extraction from uploaded files for the agent chat.
 * Heavy parsers (pdf.js, mammoth, Tesseract) load from CDN on first use,
 * so the docs bundle stays lean. Everything runs in the browser — file
 * contents never touch our server except as part of the chat query.
 */

const CDN = {
  pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  pdfjsWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
};

/** Per-file cap keeps the agent request payload within API limits. */
export const MAX_CHARS_PER_FILE = 20_000;

export const AGENT_UPLOAD_ACCEPT =
  ".eml,.msg,.txt,.csv,.log,.md,.html,.htm,.xml,.json,.stix,.stix2,.yaml,.yml,.pdf,.docx,.doc,image/*";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.getAttribute("data-loaded") === "true") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => {
      s.setAttribute("data-loaded", "true");
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Pull IOC-bearing strings out of a STIX 1.x/2.x JSON document. */
export function stixToText(node: unknown, out: string[]): void {
  if (typeof node === "string") return;
  if (Array.isArray(node)) {
    for (const n of node) stixToText(n, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (
        typeof v === "string" &&
        ["pattern", "value", "name", "url", "address_value", "description"].includes(k)
      ) {
        out.push(v);
      } else if (k === "hashes" && v && typeof v === "object") {
        for (const h of Object.values(v as Record<string, unknown>)) {
          if (typeof h === "string") out.push(h);
        }
      } else if (v && typeof v === "object") {
        stixToText(v, out);
      }
    }
  }
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff"];

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(opts: { data: ArrayBuffer }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getTextContent(): Promise<{ items: { str?: string }[] }>;
      }>;
    }>;
  };
}

interface MammothLib {
  extractRawText(opts: { arrayBuffer: ArrayBuffer }): Promise<{ value?: string }>;
}

interface TesseractLib {
  recognize(file: File, lang: string): Promise<{ data?: { text?: string } }>;
}

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();

  if (ext === "pdf" || file.type === "application/pdf") {
    await loadScript(CDN.pdfjs);
    const pdfjs = (window as unknown as { pdfjsLib: PdfJsLib }).pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfjsWorker;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(content.items.map((it) => it.str ?? "").join(" "));
    }
    return pages.join("\n");
  }

  if (ext === "docx") {
    await loadScript(CDN.mammoth);
    const mammoth = (window as unknown as { mammoth: MammothLib }).mammoth;
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return String(result.value ?? "");
  }

  if (ext === "doc") {
    throw new Error(`${file.name}: legacy .doc is not supported — save it as .docx and retry`);
  }

  if (IMAGE_EXTS.includes(ext) || file.type.startsWith("image/")) {
    await loadScript(CDN.tesseract);
    const Tesseract = (window as unknown as { Tesseract: TesseractLib }).Tesseract;
    const result = await Tesseract.recognize(file, "eng");
    return String(result.data?.text ?? "");
  }

  // STIX 2.x bundles and other JSON intel exports
  if (["json", "stix", "stix2"].includes(ext) || file.type === "application/json") {
    const text = await file.text();
    try {
      const out: string[] = [];
      stixToText(JSON.parse(text), out);
      if (out.length > 0) return out.join("\n");
    } catch {
      /* not valid JSON — fall through to raw text */
    }
    return text;
  }

  // eml, msg, txt, csv, xml, html, yaml, log… — treat as plain text
  return await file.text();
}

export interface AgentAttachment {
  name: string;
  text: string;
  truncated: boolean;
}

export async function attachmentFromFile(file: File): Promise<AgentAttachment> {
  const raw = (await extractTextFromFile(file)).trim();
  if (!raw) throw new Error(`${file.name}: no text could be extracted`);
  return {
    name: file.name,
    text: raw.slice(0, MAX_CHARS_PER_FILE),
    truncated: raw.length > MAX_CHARS_PER_FILE,
  };
}

/** Combine the typed message and attachments into one agent query. */
export function buildQueryWithAttachments(input: string, attachments: AgentAttachment[]): string {
  if (attachments.length === 0) return input;
  const blocks = attachments.map(
    (a) =>
      `--- Attached file: ${a.name}${a.truncated ? " (truncated)" : ""} ---\n${a.text}`
  );
  return [input, ...blocks].filter(Boolean).join("\n\n");
}
