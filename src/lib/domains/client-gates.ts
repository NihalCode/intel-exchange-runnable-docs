/** Client-safe mirrors of server feature gates (must match env in deployment). */
export function isCustomSnippetQueryParamsEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_CUSTOM_SNIPPET_QUERY_PARAMS_ENABLED === "true";
}

export function isChatResponseNavigationEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_CHAT_RESPONSE_NAVIGATION_ENABLED === "true";
}
