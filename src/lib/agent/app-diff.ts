export type FileChangeStatus = "added" | "removed" | "modified" | "unchanged";

export interface AppFileDiff {
  path: string;
  status: Exclude<FileChangeStatus, "unchanged">;
  additions: number;
  deletions: number;
  /** Short unified-style preview (first changed hunks). */
  preview: string;
}

export interface AgentAppDiff {
  fromVersion: number;
  toVersion: number;
  summary: string;
  files: AppFileDiff[];
  stats: { added: number; removed: number; modified: number; unchanged: number };
}

function fileMap(files: { path: string; code: string }[]): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.code]));
}

/** Simple line diff — counts +/- lines and builds a short preview. */
function lineDiffPreview(oldCode: string, newCode: string, maxLines = 24): string {
  const oldLines = oldCode.split("\n");
  const newLines = newCode.split("\n");
  const out: string[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen && out.length < maxLines; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) continue;
    if (o !== undefined && n !== undefined) {
      out.push(`-${o}`);
      out.push(`+${n}`);
    } else if (o !== undefined) {
      out.push(`-${o}`);
    } else if (n !== undefined) {
      out.push(`+${n}`);
    }
  }

  if (out.length >= maxLines) out.push("…");
  return out.join("\n");
}

export function diffAppFiles(
  oldFiles: { path: string; code: string }[],
  newFiles: { path: string; code: string }[],
  summary = "Updated app files"
): AgentAppDiff {
  const oldMap = fileMap(oldFiles);
  const newMap = fileMap(newFiles);
  const allPaths = [...new Set([...oldMap.keys(), ...newMap.keys()])].sort();

  const files: AppFileDiff[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;
  let unchanged = 0;

  for (const path of allPaths) {
    const oldCode = oldMap.get(path);
    const newCode = newMap.get(path);

    if (oldCode === undefined && newCode !== undefined) {
      added++;
      files.push({
        path,
        status: "added",
        additions: newCode.split("\n").length,
        deletions: 0,
        preview: newCode
          .split("\n")
          .slice(0, 12)
          .map((l) => `+${l}`)
          .join("\n"),
      });
    } else if (oldCode !== undefined && newCode === undefined) {
      removed++;
      files.push({
        path,
        status: "removed",
        additions: 0,
        deletions: oldCode.split("\n").length,
        preview: oldCode
          .split("\n")
          .slice(0, 12)
          .map((l) => `-${l}`)
          .join("\n"),
      });
    } else if (oldCode !== undefined && newCode !== undefined && oldCode !== newCode) {
      modified++;
      const oldLines = oldCode.split("\n");
      const newLines = newCode.split("\n");
      let additions = 0;
      let deletions = 0;
      const maxLen = Math.max(oldLines.length, newLines.length);
      for (let i = 0; i < maxLen; i++) {
        if (oldLines[i] !== newLines[i]) {
          if (oldLines[i] !== undefined) deletions++;
          if (newLines[i] !== undefined) additions++;
        }
      }
      files.push({
        path,
        status: "modified",
        additions,
        deletions,
        preview: lineDiffPreview(oldCode, newCode),
      });
    } else {
      unchanged++;
    }
  }

  return {
    fromVersion: 0,
    toVersion: 0,
    summary,
    files,
    stats: { added, removed, modified, unchanged },
  };
}

export function slugifyProjectName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52);
}
