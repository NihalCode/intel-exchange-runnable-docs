import { guardAskAgent } from "@/lib/documentation-auth/guard-api";
import JSZip from "jszip";

export const runtime = "nodejs";

interface ZipRequest {
  files: { path: string; code: string }[];
  appName: string;
}

export async function POST(req: Request) {
  const session = await guardAskAgent(req as import("next/server").NextRequest);
  if (session instanceof Response) return session;

  try {
    const { files, appName } = (await req.json()) as ZipRequest;

    if (!Array.isArray(files) || files.length === 0) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.path, file.code);
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
        "Content-Disposition": `attachment; filename="${slug}.zip"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zip generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
