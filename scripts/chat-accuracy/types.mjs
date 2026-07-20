/**
 * @typedef {"workflow" | "snippet" | "app_build" | "app_edit" | "explain" | "deploy" | "commit" | "preview"} ChatIntentFamily
 * @typedef {"plan" | "gated_unavailable" | "refusal" | "abstention" | "abstention_or_no_invent" | "secret_refusal" | "side_effect_refusal"} ChatResponseType
 * @typedef {"answered" | "partially_answered" | "no_verified_solution" | "no_results" | "clarification_required" | "access_blocked" | "credential_blocked" | "provider_error" | "system_error" | "cancelled"} ExpectedOutcome
 * @typedef {"concept" | "endpoint" | "authentication" | "authorization" | "parameters" | "request_body" | "response_schema" | "status_code" | "pagination" | "filtering" | "troubleshooting" | "upgrade" | "snippet" | "unsupported" | "cross_product" | "multi_turn" | "adversarial" | "readability" | "error_recovery"} ProductionChatCategory
 *
 * @typedef {object} ProductionChatCase
 * @property {string} id
 * @property {string} prompt
 * @property {ChatIntentFamily} expectedIntent
 * @property {ChatIntentFamily[]=} fallbackIntent
 * @property {string[]} expectedProducts
 * @property {string=} productSelector
 * @property {string=} expectedSlug
 * @property {string=} retrievalSlug
 * @property {boolean=} rankExpected
 * @property {string[]=} mustContain
 * @property {string[]=} mustNotContain
 * @property {string[]=} forbiddenClaims
 * @property {ChatResponseType=} responseType
 * @property {boolean=} hasProjectFiles
 * @property {ProductionChatCategory=} category
 * @property {{ method: string, path: string, version?: string }=} expectedEndpoint
 * @property {boolean=} snippetExpected
 * @property {string[]=} expectedSnippetLanguages
 * @property {boolean=} citationRequired
 * @property {string[]=} expectedSourceIds
 * @property {ExpectedOutcome=} expectedOutcome
 * @property {number=} maxResponseLength
 * @property {string[]=} readabilityRules
 * @property {Array<{ role: string, content: string }>=} conversationHistory
 * @property {Array<{ role: string, content: string }>=} priorTurns
 *
 * @typedef {object} ChatTestCase
 * @property {string} id Stable fixture identifier.
 * @property {string} prompt User prompt submitted to the documentation agent.
 * @property {ChatIntentFamily} expectedIntent Expected deterministic intent family.
 * @property {string[]} expectedProducts Product IDs expected in routing scope.
 * @property {string=} expectedSlug Documented endpoint slug when an endpoint is expected.
 * @property {string=} retrievalSlug Source endpoint slug expected in lexical retrieval when manifest dedupes aliases.
 * @property {boolean=} rankExpected Set false when an endpoint's unusually large source chunk makes lexical top-K ranking non-deterministic.
 * @property {string[]=} mustContain Terms expected in an offline plan or workflow.
 * @property {string[]=} mustNotContain Terms prohibited from an offline plan or workflow.
 * @property {ChatResponseType=} responseType Expected safe terminal response behavior.
 * @property {boolean=} hasProjectFiles Whether the loaded workspace contains editable files.
 */

/**
 * @typedef {"build_app" | "edit_app" | "explain_only" | "snippet"} ProductionBuildAppIntent
 *
 * @typedef {object} ProductionBuildAppCase
 * @property {string} id Stable fixture identifier.
 * @property {"ctix" | "cftr" | "csap" | "orchestrate"} product Product under test.
 * @property {string} prompt User prompt.
 * @property {ProductionBuildAppIntent} expectedIntent Build-app suite intent family.
 * @property {string|string[]} expectedProductScope Expected resolveProductScope productIds.
 * @property {string=} productSelector Explicit productId passed to the agent.
 * @property {boolean=} hasProjectFiles Whether a loaded project exists (edit collisions).
 * @property {boolean} buildMustSucceed When true, deterministic generateAppBlueprint must succeed.
 * @property {string[]} forbiddenFiles Paths that must not appear (e.g. ".env" with secrets).
 * @property {string=} notes Human-readable rationale.
 * @property {string[]=} fallbackAgentIntents Extra AgentIntent values allowed for collisions.
 */

export {};
