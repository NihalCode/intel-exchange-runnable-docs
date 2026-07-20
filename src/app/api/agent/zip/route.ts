import { guardAgentFeature } from "@/lib/documentation-auth/guard-api";
import { safeZipEntryPath } from "@/lib/security/safe-zip-path";
import JSZip from "jszip";

export const runtime = "nodejs";

interface ZipRequest {
  files: { path: string; code: string }[];
  appName: string;
}

export async function POST(req: Request) {
  const session = await guardAgentFeature(
    req as import("next/server").NextRequest,
    "project_download"
  );
  if (session instanceof Response) return session;

  try {
    const { files, appName } = (await req.json()) as ZipRequest;

    if (!Array.isArray(files) || files.length === 0) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }
    if (files.length > 200) {
      return Response.json({ error: "Too many files" }, { status: 400 });
    }

    const zip = new JSZip();
    for (const file of files) {
      const entry = safeZipEntryPath(String(file.path ?? ""));
      if (!entry) {
        return Response.json({ error: "Invalid file path in archive request" }, { status: 400 });
      }
      const code = typeof file.code === "string" ? file.code : "";
      if (code.length > 1_000_000) {
        return Response.json({ error: "File contents too large" }, { status: 400 });
      }
      zip.file(entry, code);
    }

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slug || "app"}.zip"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zip generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
