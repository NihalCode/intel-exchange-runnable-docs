import "server-only";

import {
  diffDocumentationSchemas,
  type SchemaDiff,
} from "@/lib/documentation-schemas/diff";
import {
  activateSchemaVersion,
  createSchemaWithVersion,
  findSchema,
  findSchemaVersion,
  rollbackPublishedVersion,
  updateSchemaVersion,
  type DocumentationSchemaVersion,
} from "@/lib/documentation-schemas/repository";
import {
  stableSourceHash,
  validateDocumentationSchema,
  type DocumentationSchemaFormat,
} from "@/lib/documentation-schemas/validation";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function previewFor(validation: ReturnType<typeof validateDocumentationSchema>) {
  const parsed =
    validation.parsed && typeof validation.parsed === "object"
      ? (validation.parsed as Record<string, unknown>)
      : {};
  const paths =
    parsed.paths && typeof parsed.paths === "object"
      ? (parsed.paths as Record<string, Record<string, unknown>>)
      : {};
  const nav = Object.keys(paths)
    .sort()
    .map((path) => ({
      path,
      methods: Object.keys(paths[path] ?? {})
        .filter((method) =>
          ["get", "post", "put", "patch", "delete", "head", "options"].includes(method)
        )
        .map((method) => method.toUpperCase()),
    }));
  return {
    title: validation.summary.title,
    endpointCount: validation.summary.endpointCount,
    pageCount: validation.summary.pageCount,
    navigation: nav,
  };
}

export async function createDocumentationSchema(input: {
  organizationId: string;
  userId: string;
  name: string;
  format: DocumentationSchemaFormat;
  productId: string;
  environment: string;
  sourceText: string;
}) {
  const name = input.name.trim();
  if (!name || !input.sourceText.trim()) throw new Error("SCHEMA_INPUT_REQUIRED");
  const slug = slugify(name);
  if (!slug) throw new Error("SCHEMA_NAME_INVALID");
  return createSchemaWithVersion({
    ...input,
    name,
    slug,
    sourceHash: stableSourceHash(input.sourceText),
  });
}

export async function validateSchemaVersion(input: {
  organizationId: string;
  versionId: string;
  expectedVersion: number;
}): Promise<DocumentationSchemaVersion> {
  const version = await findSchemaVersion(input.organizationId, input.versionId);
  if (!version) throw new Error("SCHEMA_VERSION_NOT_FOUND");
  const schema = await findSchema(input.organizationId, version.schemaId);
  if (!schema) throw new Error("SCHEMA_NOT_FOUND");
  const validation = validateDocumentationSchema({
    format: schema.format,
    source: version.sourceText,
    productId: schema.productId,
  });
  let diff: SchemaDiff = {
    breakingCount: 0,
    nonbreakingCount: 0,
    docsOnlyCount: 0,
    items: [],
  };
  if (schema.activeVersionId && schema.activeVersionId !== version.id) {
    const active = await findSchemaVersion(input.organizationId, schema.activeVersionId);
    if (active) {
      const activeValidation = validateDocumentationSchema({
        format: schema.format,
        source: active.sourceText,
        productId: schema.productId,
      });
      diff = diffDocumentationSchemas({
        format: schema.format,
        previous: activeValidation.parsed,
        next: validation.parsed,
      });
    }
  }
  return updateSchemaVersion({
    organizationId: input.organizationId,
    versionId: version.id,
    expectedVersion: input.expectedVersion,
    status: validation.valid ? "VALID" : "INVALID",
    validation: {
      valid: validation.valid,
      format: validation.format,
      hash: validation.hash,
      issues: validation.issues,
      summary: validation.summary,
    },
    diff: diff as unknown as Record<string, unknown>,
    preview: previewFor(validation),
    breakingCount: diff.breakingCount,
  });
}

export async function submitSchemaVersion(input: {
  organizationId: string;
  userId: string;
  versionId: string;
  expectedVersion: number;
}): Promise<DocumentationSchemaVersion> {
  const version = await findSchemaVersion(input.organizationId, input.versionId);
  if (!version || version.status !== "VALID") throw new Error("SCHEMA_NOT_VALID");
  return updateSchemaVersion({
    organizationId: input.organizationId,
    versionId: input.versionId,
    expectedVersion: input.expectedVersion,
    status: "PENDING_REVIEW",
  });
}

export function assertSchemaReviewAllowed(input: {
  reviewerRole: string;
  reviewerUserId: string;
  authorUserId: string;
  reason: string;
}): void {
  if (!["owner", "admin"].includes(input.reviewerRole)) throw new Error("FORBIDDEN");
  if (input.authorUserId === input.reviewerUserId) {
    throw new Error("SELF_APPROVAL_FORBIDDEN");
  }
  if (!input.reason.trim()) throw new Error("REVIEW_REASON_REQUIRED");
}

export async function reviewSchemaVersion(input: {
  organizationId: string;
  reviewerUserId: string;
  reviewerRole: string;
  versionId: string;
  expectedVersion: number;
  decision: "approve" | "reject";
  reason: string;
}): Promise<DocumentationSchemaVersion> {
  const version = await findSchemaVersion(input.organizationId, input.versionId);
  if (!version || version.status !== "PENDING_REVIEW") {
    throw new Error("SCHEMA_NOT_PENDING_REVIEW");
  }
  assertSchemaReviewAllowed({
    reviewerRole: input.reviewerRole,
    reviewerUserId: input.reviewerUserId,
    authorUserId: version.authorUserId,
    reason: input.reason,
  });
  return updateSchemaVersion({
    organizationId: input.organizationId,
    versionId: input.versionId,
    expectedVersion: input.expectedVersion,
    status: input.decision === "approve" ? "APPROVED" : "REJECTED",
    approverUserId: input.reviewerUserId,
    reviewReason: input.reason.trim(),
  });
}

export async function publishSchemaVersion(input: {
  organizationId: string;
  userId: string;
  role: string;
  versionId: string;
  expectedVersion: number;
  idempotencyKey: string;
}): Promise<DocumentationSchemaVersion> {
  if (!["owner", "admin"].includes(input.role)) throw new Error("FORBIDDEN");
  const version = await findSchemaVersion(input.organizationId, input.versionId);
  if (!version) throw new Error("SCHEMA_VERSION_NOT_FOUND");
  const schema = await findSchema(input.organizationId, version.schemaId);
  if (!schema) throw new Error("SCHEMA_NOT_FOUND");
  return activateSchemaVersion({
    organizationId: input.organizationId,
    userId: input.userId,
    schemaId: schema.id,
    versionId: version.id,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function rollbackSchemaVersion(input: {
  organizationId: string;
  userId: string;
  role: string;
  versionId: string;
  expectedVersion: number;
}): Promise<DocumentationSchemaVersion> {
  if (!["owner", "admin"].includes(input.role)) throw new Error("FORBIDDEN");
  return rollbackPublishedVersion({
    organizationId: input.organizationId,
    userId: input.userId,
    versionId: input.versionId,
    expectedVersion: input.expectedVersion,
  });
}
