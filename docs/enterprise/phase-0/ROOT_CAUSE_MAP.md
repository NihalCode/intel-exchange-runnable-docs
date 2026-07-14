# Root-Cause Map

Map symptoms → underlying defects. Fix causes so categories cannot silently recur.

| ID | Observed symptom | Root cause | Phase |
|---|---|---|---|
| RC-01 | Docs require login | Proxy default-protect; `/docs` not in public allowlist; `.env.example` documents invite-only whole-app | 2 |
| RC-02 | Tabs ask to re-login after Auth0 | Session cookie / app session gap (partially mitigated via `continueWithAuthHeaders` / `post-login`); incomplete durable session contract | 2, 3, 5 |
| RC-03 | Chat lost / multi-tab inconsistency | Client-only `localStorage` workspace; no server turn IDs / idempotency | 5 |
| RC-04 | Duplicate or confusing status+final | Single JSON response + client rendering of status/plan without strict one-`assistant_final` model; no stream protocol | 5, 9 |
| RC-05 | Docs/support query mutates generated app | Regex intent (`intent.ts`) overweights edit/build terms when project present | 6 |
| RC-06 | Wrong product / context bleed | Weak topic-shift detection; conversation text concatenated into retrieval; broad query expansions | 6, 7 |
| RC-07 | Pinecone failures silent | Soft catch → BM25 without degraded-state UX/telemetry labels | 7, 15 |
| RC-08 | Misleading confidence % | Raw similarity treated as calibrated confidence | 7, 9 |
| RC-09 | Hallucinated/hard-coded workflows | Template-heavy planners + loose JSON parsing without claim/citation verifier | 8, 9 |
| RC-10 | Admin shows fake metrics as live | Mock modules rendered in production screens without default-off Support Agent flag | 4, 10 |
| RC-11 | Deploy “succeeds” with broken TS/ESLint | `ignoreBuildErrors` / `ignoreDuringBuilds` in generator + forced in deploy route | 12 |
| RC-12 | AWS vault “stores” without SDK | `AwsVaultStub` fail-open path in `vault-providers.ts` | 3 |
| RC-13 | Build warning / incomplete vault | Optional `@aws-sdk/client-secrets-manager` unresolved at compile | 1, 3 |
| RC-14 | Query-string CTIX secrets leakage risk | Platform API auth design + runner URL assembly; logs/history may capture | 13 |
| RC-15 | SSRF tests brittle / DNS mock issues | Network stack not fully injectable behind test doubles | 1, 13 |
| RC-16 | Native sqlite / archive pollution | `better-sqlite3` platform binary + vendored `node_modules`/`.next` in working trees/archives | 0, 1, 19 |
| RC-17 | Font/network build failure (historical) | Network-dependent Google font fetch during build | 1 |
| RC-18 | Lint debt / React effect antipatterns | Accumulated ESLint findings; generated fixtures in lint target | 1 |
| RC-19 | Invite vs direct-add confusion | Direct Auth0 provision implemented; invite routes, gates, and stale copy remain | Phase 3 cleanup |
| RC-20 | No CI gates | No GitHub Actions; releases rely on local/Vercel build only | 19 |
| RC-21 | Missing Node engines pin | No `engines`, `.nvmrc`; local Node 24 vs deploy Node 20 mismatch risk | 0, 1 |
| RC-22 | Cross-tenant risk surface | App-level filters; RLS / least-privilege DB roles not fully enforced as defense-in-depth | 3 |
| RC-23 | Prompt injection via retrieved docs | Retrieved text treated as planning evidence without hard instruction quarantine | 7, 8 |
| RC-24 | Management API missing in prod | Direct add fails without Management client env — operational, not code architecture | ops + 3 docs |

## Categories of failure (recurrence targets)

1. **Access policy mismatch** (RC-01, RC-02)
2. **Client-authoritative state** (RC-03, RC-04)
3. **Heuristic intent / retrieval contamination** (RC-05–RC-08, RC-23)
4. **Mock-as-production** (RC-10)
5. **Fail-open security** (RC-11, RC-12, RC-14)
6. **Non-reproducible toolchain** (RC-13, RC-15–RC-18, RC-20, RC-21)
