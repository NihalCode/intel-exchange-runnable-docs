/** Client-facing docs: no credential UI, no live runs unless explicitly enabled. */
export function isLiveApiUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_LIVE_API_UI === "true";
}

/** Public documentation mode — default when live UI is disabled. */
export function isPublicDocsMode(): boolean {
  return !isLiveApiUiEnabled();
}

export function liveRunBlockedMessage(): string {
  return (
    "Live API execution requires developer credentials and is not available in public documentation mode. " +
    "Documentation and example code with placeholders are still available. " +
    "A developer or admin can enable live testing from the Developer Console."
  );
}
