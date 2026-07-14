# Remediation Sequence

Execute phases in prompt order unless a narrow dependency reorder is required.

## Confirmed order (no reorder yet)

| Phase | Focus | Depends on | Priority drivers |
|---|---|---|---|
| **0** | Intake, allowlist, inventories | — | **this document** |
| **1** | Green build/lint/test foundation | 0 baselines | Unblocks everything |
| **2** | Route classification (public docs) | 1 | Product contract #1–#3 |
| **3** | AuthZ, tenancy, vault fail-closed | 2 | Secrets / BOLA |
| **4** | Real control plane or hide mocks | 3 | Support Agent mock ban |
| **5** | Server-backed conversation turns | 3 | Reliability |
| **6** | Intent / product / side-effect routing | 5 | Safety of mutations |
| **7** | Ingestion + hybrid retrieval integrity | 1, 6 | Grounding |
| **8** | LLM contracts + tool safety | 6, 7 | Hallucination / injection |
| **9** | Answer UX / evidence labels | 5, 8 | Duplicate finals |
| **10** | Real Support/Zendesk **or** hide | 4, 7 | Mock telemetry ban |
| **11** | Attachments / import privacy | 8 | Malware / DLP |
| **12** | App builder/deploy harden | 1, 6 | ignoreBuildErrors |
| **13** | API runner SSRF deepen | 1, 3 | Network security |
| **14** | UI polish + WCAG 2.2 AA | 2, 9 | A11y |
| **15** | Observability / audit / privacy | 5+ | Operability |
| **16** | Jobs / performance / consistency | 7, 10, 12 | Durability |
| **17** | AI eval / regression gates | 6–9 | Release quality |
| **18** | Complete test matrix | ongoing | Coverage |
| **19** | CI/CD supply chain | 1, 0 allowlist | Release governance |
| **20** | Acceptance scenarios | all prior | Done-definition |

## Justified parallel tracks (after Phase 1 green)

These may proceed in parallel **only** on separate PRs with no shared red gates:

- Phase 2 route policy ↔ Phase 3 vault fail-closed (minimal overlap)
- Phase 4 Support Agent hide (quick win) before full Phase 10 implement
- Phase 12 `ignoreBuildErrors` removal anytime after Phase 1 (small, high severity)

Document any reorder in the PR with: blocked dependency, risk, and rollback.

## Phase 0 → Phase 1 handoff

Required before claiming Phase 1 start complete:

1. Recorded baseline in `BASELINE.md`
2. `npm run security:scan-secrets` green on dirty tree (excluding ignored env)
3. Engines pin + CI scaffolding plan accepted
4. Do **not** change public-docs proxy until Phase 2 has explicit tests

## Immediate production ops (outside code phases)

Env names only (no values):

- `DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY`
- `AUTH0_MANAGEMENT_CLIENT_ID` / `AUTH0_MANAGEMENT_CLIENT_SECRET`
- `AUTH0_DATABASE_CONNECTION`

Without these, credentials UI and direct user add fail closed / error — expected.
