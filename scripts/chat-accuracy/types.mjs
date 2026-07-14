/**
 * @typedef {"workflow" | "snippet" | "app_build" | "app_edit" | "explain"} ChatIntentFamily
 * @typedef {"plan" | "gated_unavailable" | "refusal" | "abstention"} ChatResponseType
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

export {};
