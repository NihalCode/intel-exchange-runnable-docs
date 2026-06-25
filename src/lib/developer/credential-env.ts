import type { ApiProduct } from "../products/types";

export interface DeveloperCredentialSpec {
  envKey: string;
  label: string;
  required: boolean;
  /** true = never send value to client */
  secret: boolean;
}

export interface ProductDeveloperCredentials {
  productId: string;
  productName: string;
  baseUrlEnv: string;
  credentials: DeveloperCredentialSpec[];
}

const OPEN_API_CREDS: DeveloperCredentialSpec[] = [
  { envKey: "ACCESS_ID", label: "Access ID", required: true, secret: false },
  { envKey: "SECRET_KEY", label: "Secret Key", required: true, secret: true },
];

/** Server-side developer credential env vars per product (placeholders in .env.example only). */
export function developerCredentialMatrix(): ProductDeveloperCredentials[] {
  return [
    {
      productId: "ctix",
      productName: "CTIX / Intel Exchange",
      baseUrlEnv: "DEV_CYWARE_CTIX_BASE_URL",
      credentials: OPEN_API_CREDS,
    },
    {
      productId: "cftr",
      productName: "CFTR",
      baseUrlEnv: "DEV_CYWARE_CFTR_BASE_URL",
      credentials: OPEN_API_CREDS,
    },
    {
      productId: "csap",
      productName: "CSAP",
      baseUrlEnv: "DEV_CYWARE_CSAP_BASE_URL",
      credentials: OPEN_API_CREDS,
    },
    {
      productId: "orchestrate",
      productName: "Cyware Orchestrate",
      baseUrlEnv: "DEV_CYWARE_ORCHESTRATE_BASE_URL",
      credentials: OPEN_API_CREDS,
    },
  ];
}

export function envKeyFor(productId: string, field: string): string {
  return `DEV_CYWARE_${productId.toUpperCase()}_${field}`;
}

export function readDeveloperCredentialStatus(productId: string): {
  baseUrl: boolean;
  accessId: boolean;
  secretKey: boolean;
  complete: boolean;
} {
  const baseUrl = Boolean(process.env[envKeyFor(productId, "BASE_URL")]?.trim());
  const accessId = Boolean(process.env[envKeyFor(productId, "ACCESS_ID")]?.trim());
  const secretKey = Boolean(process.env[envKeyFor(productId, "SECRET_KEY")]?.trim());
  return {
    baseUrl,
    accessId,
    secretKey,
    complete: baseUrl && accessId && secretKey,
  };
}

export function missingDeveloperCredentials(productId?: string): string[] {
  const missing: string[] = [];
  const products = developerCredentialMatrix().filter(
    (p) => !productId || p.productId === productId
  );

  for (const p of products) {
    const status = readDeveloperCredentialStatus(p.productId);
    if (!status.baseUrl) missing.push(envKeyFor(p.productId, "BASE_URL"));
    if (!status.accessId) missing.push(envKeyFor(p.productId, "ACCESS_ID"));
    if (!status.secretKey) missing.push(envKeyFor(p.productId, "SECRET_KEY"));
  }

  return missing;
}

export function ingestBlockedReason(productId: string): string | null {
  if (!process.env.DEVELOPER_ACCESS_TOKEN?.trim()) {
    return "DEVELOPER_ACCESS_TOKEN is not configured on the server.";
  }
  const missing = missingDeveloperCredentials(productId);
  if (missing.length > 0) {
    return `Missing developer credentials for ${productId}: ${missing.join(", ")}`;
  }
  return null;
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}${"*".repeat(Math.min(8, value.length - 4))}${value.slice(-2)}`;
}

export function developerCredentialSummary(): {
  productId: string;
  productName: string;
  baseUrlSet: boolean;
  accessIdPreview: string;
  secretKeySet: boolean;
  complete: boolean;
}[] {
  return developerCredentialMatrix().map((p) => {
    const status = readDeveloperCredentialStatus(p.productId);
    const accessId = process.env[envKeyFor(p.productId, "ACCESS_ID")] ?? "";
    return {
      productId: p.productId,
      productName: p.productName,
      baseUrlSet: status.baseUrl,
      accessIdPreview: accessId ? maskSecret(accessId) : "",
      secretKeySet: status.secretKey,
      complete: status.complete,
    };
  });
}

/** Products that support Postman collection ingest. */
export function postmanCapableProducts(): Pick<ApiProduct, "productId" | "productName">[] {
  return [
    { productId: "cftr", productName: "CFTR" },
    { productId: "ctix", productName: "Intel Exchange" },
    { productId: "csap", productName: "CSAP" },
    { productId: "orchestrate", productName: "Cyware Orchestrate" },
  ];
}
