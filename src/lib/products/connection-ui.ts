import { getProductOrThrow } from "./registry";
import { usesOpenApiQueryAuth } from "./auth";
import type { AuthType } from "./types";

/** UI field definition for the API connection panel. */
export type ConnectionFieldKind = "access-id" | "secret-key" | "api-key" | "bearer-token";

export interface ConnectionFieldDef {
  kind: ConnectionFieldKind;
  label: string;
  placeholder: string;
  inputType: "text" | "password";
  /** Credential values are memory-only for the current browser tab. */
  persistence: "memory";
  required: boolean;
}

export interface ProductConnectionUi {
  productId: string;
  displayLabel: string;
  shortLabel: string;
  title: string;
  authTypeLabel: string;
  credentialSource: string;
  footnote: string;
  fields: ConnectionFieldDef[];
  usesOpenApi: boolean;
}

const PRODUCT_UI: Record<
  string,
  Omit<ProductConnectionUi, "productId" | "displayLabel" | "fields" | "usesOpenApi"> & {
    shortLabel: string;
  }
> = {
  ctix: {
    shortLabel: "CTIX",
    title: "Connect to Intel Exchange",
    authTypeLabel: "Open API (HMAC signature)",
    credentialSource: "Cyware Admin → Open API → Generate Credentials",
    footnote:
      "Signature and Expires are generated when you run a request. Access ID and Secret Key stay in memory for this tab only.",
  },
  csap: {
    shortLabel: "CSAP",
    title: "Connect to CSAP",
    authTypeLabel: "Open API (HMAC signature)",
    credentialSource: "CSAP Analyst Portal → Open API settings",
    footnote:
      "CSAP uses the same Open API pattern as CTIX: Access ID + Secret Key produce Signature and Expires on each run. Credentials are not stored anywhere.",
  },
  orchestrate: {
    shortLabel: "Orchestrate",
    title: "Connect to Cyware Orchestrate",
    authTypeLabel: "Open API (HMAC signature)",
    credentialSource: "Orchestrate → Configure Open API",
    footnote:
      "Orchestrate Open API calls require AccessID, Signature, and Expires on the query string — generated from your Secret Key when you run.",
  },
  cftr: {
    shortLabel: "CFTR",
    title: "Connect to CFTR",
    authTypeLabel: "Open API (HMAC signature)",
    credentialSource: "CFTR → Application settings → Open API",
    footnote:
      "CFTR Open API uses Access ID and Secret Key (not a standalone API key header). Signature and Expires are computed automatically on run.",
  },
};

function openApiFields(productId: string): ConnectionFieldDef[] {
  const accessPlaceholder =
    productId === "cftr"
      ? "From CFTR Open API settings"
      : productId === "csap"
        ? "From CSAP Analyst Portal"
        : productId === "orchestrate"
          ? "From Orchestrate Open API config"
          : "From CTIX Admin → Open API";

  return [
    {
      kind: "access-id",
      label: "Access ID",
      placeholder: accessPlaceholder,
      inputType: "text",
      persistence: "memory",
      required: true,
    },
    {
      kind: "secret-key",
      label: "Secret Key",
      placeholder: "Memory only — cleared when you close this tab",
      inputType: "password",
      persistence: "memory",
      required: true,
    },
  ];
}

function bearerFields(): ConnectionFieldDef[] {
  return [
    {
      kind: "bearer-token",
      label: "Bearer token",
      placeholder: "Paste your API token",
      inputType: "password",
      persistence: "memory",
      required: true,
    },
  ];
}

function apiKeyFields(): ConnectionFieldDef[] {
  return [
    {
      kind: "api-key",
      label: "API key",
      placeholder: "Paste your API key",
      inputType: "password",
      persistence: "memory",
      required: true,
    },
  ];
}

function fieldsForAuthType(authType: AuthType, productId: string): ConnectionFieldDef[] {
  if (usesOpenApiQueryAuth(authType)) return openApiFields(productId);
  if (authType === "bearer-token") return bearerFields();
  if (authType === "api-key-header") return apiKeyFields();
  return openApiFields(productId);
}

/** Product-aware connection panel metadata and editable fields. */
export function productConnectionUi(productId: string): ProductConnectionUi {
  const product = getProductOrThrow(productId);
  const meta = PRODUCT_UI[productId] ?? {
    shortLabel: product.displayLabel.slice(0, 12),
    title: `Connect to ${product.displayLabel}`,
    authTypeLabel: product.auth.type,
    credentialSource: product.auth.description.split(".")[0] ?? product.auth.description,
    footnote: product.auth.description,
  };

  return {
    productId,
    displayLabel: product.displayLabel,
    shortLabel: meta.shortLabel,
    title: meta.title,
    authTypeLabel: meta.authTypeLabel,
    credentialSource: meta.credentialSource,
    footnote: meta.footnote,
    fields: fieldsForAuthType(product.authType, productId),
    usesOpenApi: usesOpenApiQueryAuth(product.authType),
  };
}

/** Map connection field kind to credential storage key (lowercase). */
export function credentialKeyForField(kind: ConnectionFieldKind): string {
  switch (kind) {
    case "access-id":
      return "accessid";
    case "secret-key":
      return "secretkey";
    case "api-key":
      return "apikey";
    case "bearer-token":
      return "bearertoken";
  }
}
