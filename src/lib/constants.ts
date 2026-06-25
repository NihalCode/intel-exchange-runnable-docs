/** Official Cyware Intel Exchange API reference (Theneo docs SPA). */
export const DOCS_REFERENCE_URL =
  "https://ctixapiv3.cyware.com/intel-exchange-api-reference/intel-exchange-api-reference";

export const DOCS_ORIGIN = "https://ctixapiv3.cyware.com";

/** Default Cyware CTIX Open API tenant (cs-testv2). */
export const DISPLAY_BASE = "https://cs-testv2.cyware.com/ctixapi";

/** Default CFTR API base (Postman docs host — tenant URL TBD). */
export const CFTR_DISPLAY_BASE = "https://cftrapi.cyware.com";

/** Global regex for replacing DISPLAY_BASE in generated snippet code. */
export const DISPLAY_BASE_RE = new RegExp(
  DISPLAY_BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  "g"
);
