import type { PostmanAuthSpec, PostmanAuthType } from "./types";

const CYWARE_OPEN_API_PARAMS = new Set(["AccessID", "Signature", "Expires"]);

/** Extract placeholder names from `{{var}}` strings. */
export function extractPostmanVariables(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{([^}]+)\}\}/g)) {
    const name = m[1]?.trim();
    if (name) out.add(name);
  }
  return [...out];
}

function mapAuthType(raw: string | undefined): PostmanAuthType {
  const t = (raw || "noauth").toLowerCase();
  if (t === "noauth" || t === "none") return "none";
  if (t === "apikey") return "apikey";
  if (t === "bearer") return "bearer";
  if (t === "basic") return "basic";
  if (t === "digest") return "digest";
  if (t === "oauth1") return "oauth1";
  if (t === "oauth2") return "oauth2";
  if (t === "hawk") return "hawk";
  if (t === "awsv4") return "awsv4";
  return "unknown";
}

function authFromPostmanBlock(auth: unknown): PostmanAuthSpec {
  if (!auth || typeof auth !== "object") {
    return { type: "none", credentialPlaceholders: [], fields: [] };
  }
  const block = auth as { type?: string; apikey?: { key: string; value: string }[]; bearer?: { key: string; value: string }[]; basic?: { key: string; value: string }[] };
  const type = mapAuthType(block.type);

  const fields: { key: string; placeholder: string }[] = [];
  const placeholders = new Set<string>();

  const pushField = (key: string, value: string) => {
    const ph = extractPostmanVariables(value);
    for (const p of ph) placeholders.add(p);
    fields.push({ key, placeholder: ph[0] ? `<${ph[0]}>` : `<${key}>` });
  };

  if (type === "apikey" && Array.isArray(block.apikey)) {
    for (const f of block.apikey) pushField(f.key, f.value ?? "");
  }
  if (type === "bearer" && Array.isArray(block.bearer)) {
    for (const f of block.bearer) pushField(f.key, f.value ?? "");
  }
  if (type === "basic" && Array.isArray(block.basic)) {
    for (const f of block.basic) pushField(f.key, f.value ?? "");
  }

  return { type, credentialPlaceholders: [...placeholders], fields };
}

/** Merge auth from collection → folder chain → request (Postman inheritance). */
export function resolveInheritedAuth(
  collectionAuth: PostmanAuthSpec,
  folderAuths: PostmanAuthSpec[],
  requestAuth: PostmanAuthSpec,
  headerValues: { name: string; value: string }[],
  queryNames: string[]
): PostmanAuthSpec {
  const chain = [collectionAuth, ...folderAuths, requestAuth].filter(
    (a) => a.type !== "none"
  );
  const effective = chain.length > 0 ? chain[chain.length - 1]! : { type: "none" as const, credentialPlaceholders: [], fields: [] };

  const placeholders = new Set<string>([
    ...collectionAuth.credentialPlaceholders,
    ...folderAuths.flatMap((a) => a.credentialPlaceholders),
    ...requestAuth.credentialPlaceholders,
  ]);

  for (const h of headerValues) {
    for (const p of extractPostmanVariables(h.value)) placeholders.add(p);
  }

  const hasCywareQuery = queryNames.some((n) => CYWARE_OPEN_API_PARAMS.has(n));
  if (hasCywareQuery || [...placeholders].some((p) => /access|secret|signature|expires/i.test(p))) {
    return {
      type: "cyware-open-api",
      credentialPlaceholders: [
        ...new Set([...placeholders, "ACCESS_ID", "SECRET_KEY", "AccessID", "Signature", "Expires"]),
      ],
      fields: effective.fields.length
        ? effective.fields
        : [
            { key: "AccessID", placeholder: "<ACCESS_ID>" },
            { key: "Signature", placeholder: "<SIGNATURE>" },
            { key: "Expires", placeholder: "<EXPIRES>" },
          ],
    };
  }

  return {
    ...effective,
    credentialPlaceholders: [...placeholders],
  };
}

export function parsePostmanAuthBlock(auth: unknown): PostmanAuthSpec {
  return authFromPostmanBlock(auth);
}
