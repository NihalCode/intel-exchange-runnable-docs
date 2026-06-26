/** Shared API credential checks (client + server). */

import { usesOpenApiQueryAuth } from "./products/auth";
import { getProduct } from "./products/registry";
import { credentialKeyForField, productConnectionUi } from "./products/connection-ui";
import { isMutating } from "./security";

export function hasOpenApiCredentials(accessId: string, secretKey: string): boolean {
  return accessId.trim().length > 0 && secretKey.trim().length > 0;
}

/** Whether required connection fields are filled for a product. */
export function hasProductCredentials(
  productId: string,
  getValue: (credentialKey: string) => string
): boolean {
  const ui = productConnectionUi(productId);
  return ui.fields
    .filter((f) => f.required)
    .every((f) => {
      const key = credentialKeyForField(f.kind);
      return getValue(key).trim().length > 0;
    });
}

export function urlHasOpenApiAuth(url: string): boolean {
  try {
    const u = new URL(url);
    const accessId = u.searchParams.get("AccessID")?.trim();
    const signature = u.searchParams.get("Signature")?.trim();
    const expires = u.searchParams.get("Expires")?.trim();
    return Boolean(accessId && signature && expires);
  } catch {
    return false;
  }
}

/** Server-side: validate URL auth matches the product's auth model. */
export function urlHasAuthForProduct(url: string, productId: string): boolean {
  const product = getProduct(productId);
  if (!product) return urlHasOpenApiAuth(url);

  if (usesOpenApiQueryAuth(product.authType)) {
    return urlHasOpenApiAuth(url);
  }

  // Bearer / API key products: auth is in headers; proxy receives resolved headers from client.
  return true;
}

export function connectionRequiredMessage(method: string, productId = "ctix"): string {
  const ui = productConnectionUi(productId);
  const fieldLabels = ui.fields.filter((f) => f.required).map((f) => f.label).join(" and ");

  if (isMutating(method)) {
    return (
      `This request changes data on your ${ui.displayLabel} tenant. Enter ${fieldLabels} ` +
      "in the connection panel, then run again."
    );
  }
  return `Enter ${fieldLabels} in the connection panel to run this request against ${ui.displayLabel}.`;
}

export function serverAuthRequiredMessage(method: string, productId = "ctix"): string {
  const product = getProduct(productId);
  if (product && usesOpenApiQueryAuth(product.authType)) {
    if (isMutating(method)) {
      return "Mutating API requests require AccessID, Signature, and Expires on the request URL.";
    }
    return "Live API requests require AccessID, Signature, and Expires on the request URL.";
  }
  if (isMutating(method)) {
    return "Mutating API requests require valid authentication headers.";
  }
  return "Live API requests require valid authentication.";
}
