// Re-normalize already-vendored page JSON without re-fetching the network.
// Applies prose cleaning (CodeBlock -> fences, Callout -> blockquote, strip html)
// to endpoint descriptions and section markdown.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanProse } from "./transform.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.resolve(__dirname, "..", "src", "content", "pages");

const files = await readdir(PAGES_DIR);
let changed = 0;
for (const f of files) {
  if (!f.endsWith(".json")) continue;
  const full = path.join(PAGES_DIR, f);
  const rec = JSON.parse(await readFile(full, "utf8"));
  let dirty = false;
  if (rec.kind === "endpoint") {
    if (typeof rec.description === "string") {
      const cleaned = cleanProse(rec.description);
      if (cleaned !== rec.description) {
        rec.description = cleaned;
        dirty = true;
      }
    }
    for (const key of ["query", "body", "header", "path"]) {
      const fields = rec.request?.[key];
      if (!Array.isArray(fields)) continue;
      for (const field of fields) {
        if (typeof field.description === "string") {
          const cleaned = cleanProse(field.description);
          if (cleaned !== field.description) {
            field.description = cleaned;
            dirty = true;
          }
        }
      }
    }
  }
  if (rec.kind === "section" && typeof rec.markdown === "string") {
    const cleaned = cleanProse(rec.markdown);
    if (cleaned !== rec.markdown) {
      rec.markdown = cleaned;
      dirty = true;
    }
  }
  if (dirty) {
    await writeFile(full, JSON.stringify(rec, null, 2), "utf8");
    changed++;
  }
}
console.log(`Cleaned ${changed}/${files.length} page files.`);
