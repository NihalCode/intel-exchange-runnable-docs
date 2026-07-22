/**
 * Client-safe helpers for Unanswered Queries "Reveal exact query" UX.
 * Never log or persist returned query text here — callers own display only.
 */

export type SensitiveFieldStatus =
  | "ok"
  | "not_captured"
  | "decrypt_failed"
  | "encryption_key_missing";

export type RevealUiState =
  | { kind: "idle" }
  | {
      kind: "revealed";
      queryText: string;
      clientIp: string | null;
    }
  | {
      kind: "unavailable";
      reason: SensitiveFieldStatus | "forbidden" | "not_found" | "error";
      message: string;
      clientIp: string | null;
    };

export const REVEAL_REASON_MESSAGES: Record<
  SensitiveFieldStatus | "forbidden" | "not_found" | "error",
  string
> = {
  ok: "",
  not_captured:
    "Exact query was not captured for this row. Enable unanswered_query_sensitive_capture (UNANSWERED_QUERY_SENSITIVE_CAPTURE_ENABLED) on the product host that recorded it.",
  decrypt_failed:
    "Stored query ciphertext could not be decrypted. Confirm DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY matches the host that encrypted this row.",
  encryption_key_missing:
    "DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY is missing on this host, so ciphertext cannot be decrypted.",
  forbidden: "You do not have permission to reveal exact query text.",
  not_found: "This unanswered review was not found.",
  error: "Reveal failed. Retry, or check admin permissions and encryption configuration.",
};

export function classifyDecryptError(error: unknown): SensitiveFieldStatus {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (msg.includes("DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY")) {
    return "encryption_key_missing";
  }
  return "decrypt_failed";
}

/** Map GET /api/admin/unanswered-queries/:id?sensitive=1 → row UI state. */
export function revealStateFromApiResponse(
  httpStatus: number,
  body: {
    queryText?: string | null;
    clientIp?: string | null;
    queryStatus?: SensitiveFieldStatus;
    code?: string;
    error?: string;
  }
): RevealUiState {
  if (httpStatus === 403) {
    return {
      kind: "unavailable",
      reason: "forbidden",
      message: body.error?.trim() || REVEAL_REASON_MESSAGES.forbidden,
      clientIp: null,
    };
  }
  if (httpStatus === 404) {
    return {
      kind: "unavailable",
      reason: "not_found",
      message: body.error?.trim() || REVEAL_REASON_MESSAGES.not_found,
      clientIp: null,
    };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      kind: "unavailable",
      reason: "error",
      message: body.error?.trim() || REVEAL_REASON_MESSAGES.error,
      clientIp: null,
    };
  }

  const queryText =
    typeof body.queryText === "string" && body.queryText.length > 0
      ? body.queryText
      : null;
  const clientIp =
    typeof body.clientIp === "string" && body.clientIp.length > 0
      ? body.clientIp
      : null;

  if (queryText) {
    return { kind: "revealed", queryText, clientIp };
  }

  const reason: SensitiveFieldStatus =
    body.queryStatus === "encryption_key_missing" ||
    body.queryStatus === "decrypt_failed" ||
    body.queryStatus === "not_captured"
      ? body.queryStatus
      : body.code === "ENCRYPTION_KEY_MISSING"
        ? "encryption_key_missing"
        : body.code === "DECRYPT_FAILED"
          ? "decrypt_failed"
          : "not_captured";

  return {
    kind: "unavailable",
    reason,
    message: REVEAL_REASON_MESSAGES[reason],
    clientIp,
  };
}

export function shouldHideRevealButton(state: RevealUiState | undefined): boolean {
  if (!state || state.kind === "idle") return false;
  // Keep the button until plaintext is shown; unavailable stays visible with message.
  return state.kind === "revealed";
}
