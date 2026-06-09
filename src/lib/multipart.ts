import type { FormBodyField, ParamField } from "./types";

/** One part of a multipart/form-data body sent through the run proxy. */
export interface MultipartPart {
  name: string;
  kind: "file" | "text";
  filename?: string;
  contentType?: string;
  value?: string;
  dataBase64?: string;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function isMultipartContentType(contentType?: string): boolean {
  return (contentType ?? "").toLowerCase().includes("multipart/form-data");
}

export function isFileField(field: ParamField): boolean {
  return (field.valueType ?? "").toLowerCase() === "file";
}

/** True when the endpoint expects multipart uploads (file and/or form fields). */
export function endpointUsesMultipart(page: {
  contentType?: string;
  request?: { contentType?: string; body?: ParamField[] };
}): boolean {
  const ct = page.request?.contentType || page.contentType || "";
  if (isMultipartContentType(ct)) return true;
  return (page.request?.body ?? []).some(isFileField);
}

export function formFieldsFromBody(fields: ParamField[] | undefined): FormBodyField[] {
  if (!fields) return [];
  return fields
    .filter((f) => f.name)
    .map((f) => ({
      name: f.name,
      kind: isFileField(f) ? "file" : "text",
      description: f.description,
      isRequired: f.isRequired,
      defaultValue: f.value ?? "",
    }));
}

export function initialFormTextValues(fields: FormBodyField[]): Record<string, string> {
  return Object.fromEntries(fields.filter((f) => f.kind === "text").map((f) => [f.name, f.defaultValue ?? ""]));
}

export function buildMultipartParts(
  fields: FormBodyField[],
  textValues: Record<string, string>,
  files: Record<string, File | null | undefined>
): MultipartPart[] {
  const parts: MultipartPart[] = [];
  for (const field of fields) {
    if (field.kind === "file") {
      const file = files[field.name];
      if (!file) continue;
      parts.push({
        name: field.name,
        kind: "file",
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      });
    } else {
      const value = (textValues[field.name] ?? field.defaultValue ?? "").trim();
      if (!value) continue;
      parts.push({ name: field.name, kind: "text", value });
    }
  }
  return parts;
}

export async function attachFileData(parts: MultipartPart[], files: Record<string, File | null | undefined>): Promise<MultipartPart[]> {
  const out: MultipartPart[] = [];
  for (const part of parts) {
    if (part.kind !== "file") {
      out.push(part);
      continue;
    }
    const file = files[part.name];
    if (!file) continue;
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`File "${file.name}" exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit.`);
    }
    out.push({ ...part, dataBase64: await fileToBase64(file) });
  }
  return out;
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function validateMultipartForRun(
  fields: FormBodyField[],
  textValues: Record<string, string>,
  files: Record<string, File | null | undefined>
): string | null {
  for (const field of fields) {
    if (!field.isRequired) continue;
    if (field.kind === "file") {
      if (!files[field.name]) return `Select a file for "${field.name}".`;
    } else if (!(textValues[field.name] ?? "").trim()) {
      return `Form field "${field.name}" is required.`;
    }
  }
  const hasFile = fields.some((f) => f.kind === "file" && files[f.name]);
  const hasText = fields.some(
    (f) => f.kind === "text" && (textValues[f.name] ?? "").trim() !== ""
  );
  if (fields.some((f) => f.kind === "file") && !hasFile && !hasText) {
    return "Select a file to upload, or fill in the other form fields (e.g. URL for stix1url).";
  }
  return null;
}

export function previewMultipartParts(parts: MultipartPart[]): string {
  return parts
    .map((p) => {
      if (p.kind === "file") {
        const size = p.dataBase64 ? `, ${Math.round((p.dataBase64.length * 3) / 4)} bytes` : "";
        return `  ${p.name}: (file) ${p.filename ?? "upload"}${size}`;
      }
      return `  ${p.name}: ${p.value ?? ""}`;
    })
    .join("\n");
}
