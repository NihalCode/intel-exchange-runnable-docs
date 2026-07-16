/** Persisted request playground edits (path/query/body) for one endpoint. */
export interface PlaygroundDraft {
  pathValues?: Record<string, string>;
  queryValues?: Record<string, string>;
  bodyText?: string;
  formTextValues?: Record<string, string>;
  customQueryParams?: Array<{ id: string; name: string; value: string; enabled: boolean }>;
}

const STORAGE_KEY = "cyware-playground-sessions";

function storageAvailable(): boolean {
  return typeof sessionStorage !== "undefined";
}

function readAll(): Record<string, PlaygroundDraft> {
  if (!storageAvailable()) return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PlaygroundDraft>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, PlaygroundDraft>) {
  if (!storageAvailable()) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota or private mode */
  }
}

export function loadPlaygroundDraft(storageId: string): PlaygroundDraft | undefined {
  if (!storageId) return undefined;
  return readAll()[storageId];
}

export function savePlaygroundDraft(storageId: string, draft: PlaygroundDraft) {
  if (!storageId) return;
  const all = readAll();
  all[storageId] = draft;
  writeAll(all);
}

export function mergeStringRecords(
  defaults: Record<string, string>,
  saved: Record<string, string> | undefined
): Record<string, string> {
  if (!saved) return defaults;
  return { ...defaults, ...saved };
}

export function mergeBodyText(defaultBody: string, saved: string | undefined): string {
  if (saved === undefined) return defaultBody;
  return saved;
}
