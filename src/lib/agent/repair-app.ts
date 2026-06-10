import { defaultGlobalsCss } from "./app-builder";
import { validateAppFiles } from "./validate-app";

/**
 * Remove orphaned CSS declaration blocks left behind when an AI edit deletes
 * a selector but keeps its properties + closing brace (common search/replace
 * failure — causes "Unexpected }" in next build).
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

    // Orphan block: indented properties after a closed rule (blank lines allowed)
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

export function repairAppFiles(
  files: { path: string; code: string }[]
): { files: { path: string; code: string }[]; notes: string[] } {
  const notes: string[] = [];

  const repaired = files.map((f) => {
    if (!f.path.endsWith(".css")) return f;

    const { code: stripped, fixed } = repairCssOrphans(f.code);
    if (fixed) {
      notes.push(`Removed orphaned CSS in ${f.path} (leftover from a partial AI edit)`);
    }

    const problems = validateAppFiles([{ path: f.path, code: stripped }]);
    if (problems.length === 0) {
      return { ...f, code: stripped };
    }

    // Last resort: restore the known-good default so deploy never fails on CSS
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
