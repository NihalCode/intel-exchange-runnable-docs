import postcss from "postcss";
import { defaultGlobalsCss } from "./app-builder";
import type { AgentAppBlueprint } from "./types";
import { validateAppFiles } from "./validate-app";

/**
 * Remove orphaned CSS declaration blocks left behind when an AI edit deletes
 * a selector but keeps its properties + closing brace.
 */
export function repairCssOrphans(code: string): { code: string; fixed: boolean } {
  const lines = code.split("\n");
  const out: string[] = [];
  let fixed = false;
  let i = 0;

  function prevNonEmpty(): string {
    for (let j = out.length - 1; j >= 0; j--) {
      const t = out[j].trim();
      if (t) return t;
    }
    return "";
  }

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s+[a-z-]+:\s/.test(line) && prevNonEmpty() === "}") {
      fixed = true;
      while (i < lines.length && lines[i].trim() !== "}") i++;
      if (i < lines.length && lines[i].trim() === "}") i++;
      continue;
    }

    out.push(line);
    i++;
  }

  return { code: out.join("\n"), fixed };
}

/** Run orphan removal in a loop, then strip stray closing braces postcss rejects. */
export function repairCssFully(code: string): { code: string; notes: string[] } {
  const notes: string[] = [];
  let current = code;

  for (let pass = 0; pass < 12; pass++) {
    const { code: next, fixed } = repairCssOrphans(current);
    if (!fixed) break;
    notes.push("Removed orphaned CSS declarations");
    current = next;
  }

  for (let attempt = 0; attempt < 24; attempt++) {
    try {
      postcss.parse(current, { from: "app/globals.css" });
      return { code: current, notes };
    } catch (err) {
      const e = err as { line?: number; reason?: string };
      const lines = current.split("\n");
      let removed = false;

      if (e.line && e.line >= 1 && e.line <= lines.length) {
        const idx = e.line - 1;
        if (lines[idx].trim() === "}") {
          lines.splice(idx, 1);
          notes.push(`Removed stray "}" near line ${e.line}`);
          removed = true;
        }
      }

      if (!removed && e.reason?.includes("Unexpected }")) {
        const idx = lines.findIndex((l) => l.trim() === "}");
        if (idx >= 0) {
          lines.splice(idx, 1);
          notes.push("Removed stray closing brace");
          removed = true;
        }
      }

      if (!removed) break;
      current = lines.join("\n");
    }
  }

  return { code: current, notes };
}

export function repairAppFiles(
  files: { path: string; code: string }[]
): { files: { path: string; code: string }[]; notes: string[] } {
  const notes: string[] = [];

  const repaired = files.map((f) => {
    if (!f.path.endsWith(".css")) return f;

    const { code: stripped, notes: cssNotes } = repairCssFully(f.code);
    notes.push(...cssNotes.map((n) => `${f.path}: ${n}`));

    const problems = validateAppFiles([{ path: f.path, code: stripped }]);
    if (problems.length === 0) {
      return { ...f, code: stripped };
    }

    if (f.path === "app/globals.css") {
      notes.push(
        `Replaced broken ${f.path} with the default stylesheet — re-apply styling via the agent`
      );
      return { ...f, code: defaultGlobalsCss() };
    }

    return { ...f, code: stripped };
  });

  return { files: repaired, notes };
}

/** Repair a saved/edited app blueprint before any edit or deploy operation. */
export function repairBlueprint(
  blueprint: AgentAppBlueprint
): { blueprint: AgentAppBlueprint; notes: string[] } {
  const { files, notes } = repairAppFiles(
    blueprint.files.map((f) => ({ path: f.path, code: f.code }))
  );
  const byPath = new Map(files.map((f) => [f.path, f.code]));
  return {
    notes,
    blueprint: {
      ...blueprint,
      files: blueprint.files.map((f) => ({
        ...f,
        code: byPath.get(f.path) ?? f.code,
      })),
    },
  };
}
