# Chat Formatting and Snippet Control — Remediation Report

**Date:** 2026-07-15  
**Scope:** Documentation Agent chat presentation (answer-first UX, snippet gating, no unsolicited code walls)

---

## Root causes

1. **`defaultSimpleMode` / `isHandoffQuery` too broad** — `isHandoffQuery` included `isNonTechnicalQuery`, `\bgive (me )?(example )?code\b`, and generic “my team / developer” phrases. That flipped many normal API questions into “plain English + essay + curl” LLM prompts via `NON_TECH_RULES`.

2. **`buildCtixListIndicatorsAnswer` injected at plan time** — `enforceListIndicatorsPlan` and `orchestrate.ts` applied the full A–G template whenever `simpleMode` or list-indicators intent matched, even for standard technical queries like “which endpoint lists indicators?”.

3. **Triple UI dump** — Chat rendered polished workflow prose (`msg.content`), full `AgentWorkflowStep` cards (params + runnable snippets), and `AgentWorkflowScript` blocks together. Workflow text used `whitespace-pre-wrap` instead of Markdown.

4. **Snippet intent was cosmetic** — `classifyResponseStyle` existed but was not wired into orchestration or UI gating.

5. **LLM system prompt mandated essay + curl** — `NON_TECH_RULES` always required A–G sections and cURL for any `simpleMode` query.

---

## Before → after behavior

| User query type | Before | After |
|-----------------|--------|-------|
| “Which endpoint lists CTIX indicators?” | Essay A–G + curl in prose + step cards + scripts | Short conversational answer; sources linked; “Show API details” / “Show example code” on demand |
| “Give me a curl example for listing indicators” | Same wall + scripts | Snippet mode: code attached; scripts shown by default; prose stays brief |
| “I'm not technical — explain step by step in detail…” | Essay (correct) | Essay template only when `shouldUseEssayTemplates` (non-tech + detailed/conceptual, or IT handoff) |
| “401 on CTIX API — what should I check?” | Long workflow + code | Compact troubleshooting bullets; no code unless requested |
| “What is a CQL filter?” | Often code + steps | Conceptual answer; no code |
| “Only the curl for threat-data list” | Full answer + extras | Minimal snippet mode (`maxSections: 1`) |

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/agent/response-style.ts` | Extended `shouldUseEssayTemplates` with IT handoff; typo already fixed (`implementation\s+example`) |
| `src/lib/agent/non-technical.ts` | Narrowed `isHandoffQuery`, `defaultSimpleMode` |
| `src/lib/agent/orchestrate.ts` | Early `classifyResponseStyle`; essay/script gating; `polishWorkflowProse`; `responseStyle` on response |
| `src/lib/agent/llm.ts` | Split essay vs brief plain-English vs default conversational prompts |
| `src/lib/agent/explain-simple.ts` | Essay template only when `essayMode` |
| `src/lib/agent/planner.ts` | List-indicators plan uses brief intro only (no A–G at plan time) |
| `src/lib/agent/types.ts` | `responseStyle?: ResponseStyleDecision` on `AgentResponse` |
| `src/components/AgentChat.tsx` | Markdown rendering for assistant prose |
| `src/components/AgentMessageView.tsx` | Progressive disclosure for steps/scripts; style-based defaults |
| `src/lib/__tests__/response-style.test.ts` | New unit tests |
| `docs/enterprise/CHAT_FORMATTING_AND_SNIPPET_CONTROL_REPORT.md` | This report |

---

## Security / product constraints preserved

- Auth0 gate unchanged  
- `/api/run` SSRF proxy unchanged  
- Zendesk fail-closed unchanged  
- No edits to individual content page JSON  
- Credentials remain memory-only; masking unchanged  

---

## Tests

Run:

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

New coverage in `response-style.test.ts` for quick/endpoint, explicit curl, troubleshooting, conceptual, only-code, essay gating.

---

## Residual risks

- **LLM variability:** Even with shorter prompts, the model may occasionally add fences; `polishWorkflowProse` strips them when structured code is shown server-side.
- **Legacy sessions:** Stored chat messages without `responseStyle` fall back to progressive disclosure (steps/scripts collapsed unless mode looks detailed).
- **Handoff edge cases:** Very casual “for my developer” phrasing no longer triggers essay mode unless combined with explicit handoff/IT-team wording.
