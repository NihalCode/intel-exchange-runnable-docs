# Strict Chat / Snippet / Readability / Support Testing Report

**Date:** 2026-07-15
**Scope:** End-to-end validation of the Documentation Agent's chat accuracy, snippet
accuracy/compliance, readability, citation accuracy, multi-turn context, and Support
Agent (Zendesk) fail-closed behavior — executed against
`composer_2_5_strict_chat_snippet_readability_support_testing_prompt.txt`.
**Baseline:** `main` @ `5083b3e` ("Polish agent chat formatting and gate snippets by
user intent") — the chat formatting / snippet-control work from the prior session,
already production-deployed. This report validates that work and extends coverage;
it does not redo it.
**Branch:** `test/strict-response-quality` (created off `main`; the unrelated
`security/health-score-remediation` branch was left untouched on `origin`).

---

## Phase 0 — Baseline

| Check | Result |
|---|---|
| `git rev-parse main` / `origin/main` | `5083b3e` (in sync) |
| `security/health-score-remediation` | untouched, pushed separately, 2 commits ahead of `5083b3e` |
| `support_agent` feature flag | `DEFAULT_ENABLED: false` (fail-closed by design) |
| `OPENAI_API_KEY` / `PINECONE_API_KEY` in test/build env | unset (Vitest does not load `.env.local`) → all tests below exercise the deterministic BM25 + rule-based planner fallback, matching how this repo already tests chat accuracy (`chat-accuracy-demo.test.ts`) |
| Node / npm | v24.13.0 / 11.6.2 |
| `npx tsc --noEmit` | pass (0 errors) |
| `npm run lint` | pass (0 errors) |
| `npm test` (pre-change) | 86 files / 676 tests passing |
| `npm run build` (pre-change) | pass, ~530 pages SSG |

---

## What was tested

Reused and extended the existing `scripts/chat-accuracy/` harness and Vitest
convention (`src/lib/__tests__/chat-accuracy-*.test.ts`) rather than building a new
framework. Five new suites were added:

| Suite | File | Cases | Phases covered |
|---|---|---|---|
| Response quality matrix | `scripts/chat-accuracy/cases/response-quality-suite.json` + `chat-accuracy-response-quality.test.ts` | 49 | 3 (snippet compliance), 4 (no unrequested snippet), 6 (readability limits), 7 (troubleshooting), 8 (endpoint format), 9 (conceptual format), 16 (adversarial) |
| Support Agent fail-closed | `chat-accuracy-support.test.ts` | 18 | 12 (Zendesk/Support Agent — every documented connector state) |
| Citation accuracy | `chat-accuracy-citations.test.ts` | 5 | 13 (citations resolve to real, same-origin doc pages) |
| Multi-turn context | `chat-accuracy-multiturn.test.ts` | 3 | 5 (follow-up context retention) |
| BM25 length-normalization regression | `bm25-length-normalization.test.ts` | 2 | Unit-level root-cause regression for the Phase 5 fix below |

Combined with the pre-existing suites (`demo-critical.json` 25, `intent-collision-suite.json`
5, `security-suite.json` 5, per-product suites 9), the full chat-accuracy corpus is now
**121 scenario-level cases** plus the 5 dedicated multi-turn/citation Vitest specs above.

A typed shape for these cases (`ResponseQualityTest`) is documented in
`scripts/chat-accuracy/response-quality-types.mjs` (JSDoc, mirrors the strict prompt's
matrix: `category`, `prompt`, `selectedProduct`, `expected.{responseMode, snippetExpected,
snippetLanguage, maxWords, maxParagraphs, mustContain, mustNotContain, sideEffectExpected,
refusal}`).

---

## Failures found and fixed (Phase 18 fix loop)

Each fix below was root-caused with a scratch repro, given a durable regression test, and
verified to not break any of the other 91 test files.

### 1. Snippet-request detection missed common phrasings (`response-style.ts`)

**Root cause:** `SNIPPET_REQUEST` only matched a small enumerated set of phrasings and its
word-boundary handling broke on `c#` (no `\w`/`\W` transition between `#` and trailing
punctuation, so `\bc#\b` never matches "Show C#."). Prompts like "give me a Python
snippet", "show C#.", "only the code", "sample request" were not recognized as explicit
snippet requests, so `responseStyle.snippet.requested` was `false` and no code was
attached even though the user explicitly asked for it (a **Phase 3 compliance failure**).

**Fix:** Reworked the pattern into a shared `CODE_NOUN` alternation with a `NOUN_END`
lookahead (`(?=[^a-zA-Z0-9]|$)`) instead of `\b`, and widened `detectSnippetLanguage`'s C#
match the same way. Also broadened `DETAIL` to recognize "explain ... in detail" phrasing
(was previously misclassified as `conceptual` instead of `detailed`).

**Regression:** covered by 10 `rq-p3-*` cases in `response-quality-suite.json`.

### 2. Silent language substitution for C# (`orchestrate.ts`)

**Root cause:** There is no C# script generator in this app. When a user asked for a C#
example, the code silently fell back to Python/JavaScript scripts with no indication the
requested language wasn't honored — a correctness/trust issue under the strict pass rule
("no plausible answers without verification").

**Fix:** When `responseStyle.snippet.language === "csharp"`, append an explicit note to
the workflow: *"a C# example generator isn't available yet — showing Python and
JavaScript instead."* No fabricated C# code is produced.

**Regression:** `rq-p3-ctix-csharp` asserts the disclaimer text is present.

### 3. Orchestrate planner had no route for execution-status / cancel intents (`planner.ts`)

**Root cause:** `PRODUCT_DOC_INTENTS.orchestrate` had no pattern for "check my playbook
execution status" or "cancel a running playbook" — both fell through to generic retrieval
and returned unfocused/irrelevant citations (**Phase 8/9 endpoint-format failures**).

**Fix:** Added `EXECUTION_STATUS_PATTERN` → **Get Playbook Run Log Details** (`GET
v1/playbook/playbook-result/{id}/`) and `CANCEL_EXECUTION_PATTERN` → **Bulk Terminate
Playbook Runs** (`POST v1/playbook/playbook-result/bulk-terminate/`), checked *before* the
bare "playbooks" catch-all so they take precedence.

**Regression:** `rq-p8-orchestrate-status-endpoint`, `rq-p8-orchestrate-cancel-endpoint`.

### 4. CFTR's bare "incidents" catch-all overrode troubleshooting/bulk questions (`planner.ts`)

**Root cause:** A broad `/\bincidents?\b/i` pattern in `PRODUCT_DOC_INTENTS.cftr` matched
*any* mention of "incident" and force-answered with "Get List of Incidents" — even for
"why is bulk-updating incidents failing with a 409?", which should retrieve troubleshooting
content instead of a confidently wrong endpoint.

**Fix:** Added a `NOT_A_LIST_QUESTION` exclusion guard (bulk/update/delete/create/error
codes/"why"/"is there"/"does ... support"/"can I") and an `exclude` field on
`PRODUCT_DOC_INTENTS` entries; `enforceProductDocPlan` now skips an intent whose `exclude`
pattern also matches, falling through to retrieval instead of a wrong confident answer.

**Regression:** `rq-p7-*` troubleshooting cases assert no fabricated single-endpoint answer
for error/troubleshooting phrasing.

### 5. BM25 length normalization buried the best-matching doc behind weaker ones (`retrieve.ts`) — **the highest-impact fix**

**Root cause (found via Phase 5 multi-turn exploration, not anticipated up front):** 8 of
527 indexed chunks — exactly the most heavily-documented, highest-value endpoints
(`threat-data/list-threat-data` at 848 tokens, `quick-add-intel`, and the malware /
threat-actor / sighting SDO create/update pages) — are 3–14x longer than the ~62-token
index average because their inline CQL field-mapping / schema reference tables are chunked
together with the description. Standard BM25 length normalization
(`docLen / avgDocLen` in the denominator) treats "long" as "unfocused" and crushed these
chunks' score for *every* query. Reproduced concretely: after a first turn "How do I list
CTIX indicators?" (answered correctly via a planner shortcut), the follow-up "What about
pagination for that?" fell through to generic retrieval, and `threat-data/list-threat-data`
did not appear even in the top 8 results — replaced by topically unrelated chunks
(`action-statistics`, `run-report`, `enrich-nodes`). This is a systemic retrieval-quality
bug, not something introduced by the prior formatting session, and it was masked in most
manual/demo testing because the planner's rule-based shortcuts short-circuit before
retrieval for common first-turn phrasings — but any query that misses those shortcuts (most
follow-ups, many troubleshooting phrasings) was silently degraded.

**Fix:** Capped the BM25 length ratio at 3x the average (`MAX_LENGTH_RATIO = 3` in
`bm25Score`) — long docs are still penalized relative to average (unlike removing
normalization entirely), but no longer punished in proportion to being up to 14x longer.
Verified `threat-data/list-threat-data` moved from absent-in-top-8 to rank #1 for the exact
repro query, and remained correctly ranked below a hypothetical equally-relevant *short* doc
in a synthetic worst-case test.

**Regression:**
- `bm25-length-normalization.test.ts` — 2 focused unit tests against a synthetic index
  isolating the length-cap behavior (one proving the long doc surfaces, one proving length
  normalization is still meaningfully applied, not removed).
- `chat-accuracy-multiturn.test.ts` — 3 integration tests via `runAgent()` proving the
  anchor endpoint (`threat-data/list-threat-data`) survives into follow-up citations for
  both a vague pagination question and a "show me Python for that" snippet follow-up, plus
  a CFTR product-scope-stays-put check.

---

## Phase-by-phase results

| Phase | Area | Result |
|---|---|---|
| 0 | Baseline gates | pass (see table above) |
| 1 | Typed test matrix | `ResponseQualityTest` shape defined and used by 49 cases |
| 2 | Existing suite regression | 44 pre-existing chat-accuracy cases still pass |
| 3 | Snippet accuracy (attach when requested) | 10/10 pass after fix #1 |
| 4 | No unrequested snippet | 8/8 pass — no `` ``` `` in prose for conceptual/troubleshooting prompts unless explicitly asked |
| 5 | Multi-turn context | 3/3 pass after fix #5 (previously would have failed — verified via pre-fix repro) |
| 6 | Readability (word/paragraph caps, plain language) | 7/7 pass |
| 7 | Troubleshooting accuracy (no fabricated root cause) | 7/7 pass after fix #4 |
| 8 | Endpoint-format precision (method+path correctness) | 4/4 pass after fix #3 |
| 9 | Conceptual-format precision (no code unless asked) | 4/4 pass |
| 10 | Cross-product boundary | covered by pre-existing `demo-12/13/14`; still pass |
| 11 | Mixed-intent routing | covered by `intent-collision-suite.json`; still pass |
| 12 | Support Agent / Zendesk fail-closed | **18/18 pass** — every documented connector state (disconnected, expired auth, syncing, stale, rate-limited, timeout, cross-tenant, internal-note permission, before/after sync) returns the single canonical `SUPPORT_AGENT_UNAVAILABLE` response; zero fabricated ticket IDs or health claims |
| 13 | Citation accuracy | 5/5 pass — every citation across 4 products resolves to a real manifest slug and a same-origin `/docs/` URL; a prompt-injected fake URL is never cited |
| 16 | Adversarial / prompt injection | 8/8 pass (fabrication refusal, secret-disclosure refusal, cross-tenant refusal, chain-of-thought refusal, fake-citation refusal) — reuses `fabricationRefusal()` / `secretDisclosureRefusal()` from `safety.ts` |
| 18 | Fix loop | 5 root-caused, fixed, regression-tested (above) |
| 19 | Full quality gate + secret scan | pass (below) |

---

## Phase 19 — Full quality gate (post-fix)

| Gate | Result |
|---|---|
| `npm test` | **91 files / 753 tests passing** (676 baseline + 77 new) |
| `npx tsc --noEmit` | pass, 0 errors |
| `npm run lint` | pass, 0 errors/warnings |
| `npm run build` | pass, ~530 pages SSG, no route errors |
| `npx playwright test` (`test:e2e`) | **13/13 passing** (auth, admin, public-docs specs; `AUTH_DISABLED=true` webServer) |
| `node scripts/security/scan-secrets.mjs` | **OK** — 1477 tracked files, 25 forbidden patterns, none matched |

No scratch/debug files were committed (`zzz-*` exploration files were used locally and
deleted before this report was written).

---

## Files changed

| File | Change |
|---|---|
| `src/lib/agent/response-style.ts` | Broader `SNIPPET_REQUEST` pattern (shared `CODE_NOUN`/`NOUN_END`), fixed `c#` boundary matching, broadened `DETAIL` |
| `src/lib/agent/orchestrate.ts` | Explicit disclaimer when C# is requested but unavailable |
| `src/lib/agent/planner.ts` | Orchestrate execution-status/cancel intents; CFTR incidents catch-all narrowed with `NOT_A_LIST_QUESTION` exclusion guard |
| `src/lib/agent/retrieve.ts` | BM25 length-ratio cap (`MAX_LENGTH_RATIO = 3`) so long, high-value endpoint docs aren't buried by short-doc length normalization |
| `scripts/chat-accuracy/response-quality-types.mjs` | New `ResponseQualityTest` JSDoc type |
| `scripts/chat-accuracy/cases/response-quality-suite.json` | New 49-case suite (Phases 3, 4, 6, 7, 8, 9, 16) |
| `src/lib/__tests__/chat-accuracy-response-quality.test.ts` | Runner for the suite above; writes `artifacts/chat-accuracy/response-quality-report.json` |
| `src/lib/__tests__/chat-accuracy-support.test.ts` | 18-case Support Agent fail-closed suite (Phase 12) |
| `src/lib/__tests__/chat-accuracy-citations.test.ts` | 5-case citation-accuracy suite (Phase 13) |
| `src/lib/__tests__/chat-accuracy-multiturn.test.ts` | 3-case multi-turn context suite (Phase 5) |
| `src/lib/__tests__/bm25-length-normalization.test.ts` | 2-case unit regression for the retrieval fix |
| `docs/enterprise/STRICT_CHAT_SNIPPET_READABILITY_SUPPORT_TESTING_REPORT.md` | This report |

---

## Security / product constraints preserved

- Auth0 gate unchanged; no docs made public.
- `/api/run` SSRF proxy unchanged.
- `support_agent` remains disabled by default; fail-closed path verified exhaustively (Phase 12), not invented.
- No individual `src/content/**/*.json` page files edited (all fixes are in central lib code, per `AGENTS.md`).
- No secrets committed; `scan-secrets.mjs` clean.
- `security/health-score-remediation` branch untouched — no unrelated analyzer work mixed into this branch's commits.

---

## Remaining risks / known limitations

1. **Test environment has no live LLM/embeddings.** `OPENAI_API_KEY` and `PINECONE_API_KEY`
   are configured in `.env.local` for the app at runtime, but Vitest does not load
   `.env.local`, so every test in this report (and in the pre-existing `chat-accuracy-demo`
   suite) exercises the deterministic BM25 + rule-based planner fallback, not the
   production LLM planner. This is intentional (matches the documented fallback design in
   `AGENTS.md`) and keeps the suite fast, free, and deterministic, but it means genuinely
   novel phrasings that only the LLM planner would handle well are not exercised here. The
   BM25 length-normalization fix (item 5) benefits *both* paths, since retrieval feeds the
   LLM's context too.
2. **BM25 length cap is a mitigation, not a re-chunking fix.** The 8 oversized chunks
   identified (`threat-data/list-threat-data`, `quick-add-intel`, and the SDO create/update
   pages) would ideally be split at ingest time (description chunk vs. reference-table
   chunk) in `scripts/build-agent-index.mjs` for a more precise long-term fix. That is a
   content-pipeline change outside this session's scope (would require regenerating
   `agent-index.json` and re-verifying Pinecone parity) and is called out here rather than
   attempted silently.
3. **Multi-turn coverage is representative, not exhaustive.** 3 cases cover the most common
   follow-up shapes (vague continuation, snippet-on-topic follow-up, cross-turn product
   scope). Deeper multi-turn chains (3+ turns, topic switches mid-conversation) are not
   covered.
4. **Playwright e2e logged (but did not fail on) a CSRF-secret warning** for one
   admin-control-plane API route during the run — pre-existing, unrelated to this session's
   changes, and did not affect the 13/13 pass result. Not investigated further as out of
   scope for chat/snippet/readability/support testing.

---

## Summary

- **121 chat-accuracy scenario cases** (44 pre-existing + 77 new) plus 5 dedicated
  integration/unit specs, all passing.
- **5 real bugs found and durably fixed** with regression tests: snippet-request detection
  gaps, silent C# substitution, missing Orchestrate execution-status/cancel routing, an
  overly broad CFTR catch-all, and a systemic BM25 length-normalization bug that was
  burying the highest-value, most-documented endpoints from retrieval.
- **Support Agent verified fail-closed** across all 18 documented Zendesk connector states —
  no fabricated tickets, no invented health/connectivity claims.
- **Citation accuracy verified** — every citation across all 4 products resolves to a real,
  same-origin documentation page.
- **All quality gates green**: typecheck, lint, 753 unit tests, production build, 13/13
  Playwright e2e, secret scan.
