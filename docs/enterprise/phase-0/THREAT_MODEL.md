# Threat Model (Phase 0)

| Threat | Current controls | Gaps | Target phase |
|---|---|---|---|
| Prompt injection via docs/attachments | Partial untrusted-content awareness | No systematic channel separation; attachments not fully hardened | 8, 11 |
| Tool / side-effect abuse | Feature flags default-off for deploy/commit; confirmation on mutating HTTP | Ambiguous intent may still reach edit path when project loaded | 6, 12 |
| Cross-tenant retrieval / BOLA | Session + org context; credential product scoping | Vector namespace isolation TBD; incomplete RLS | 3, 7 |
| BFLA / privilege escalation | Role→permission maps; admin page guards | Scattered checks; MFA/step-up incomplete for production ops | 3 |
| Secret leakage | Memory-only SecretKey; mask helpers; env gitignore | Query-string Open API creds; localStorage workspace risk; vault stub; logs | 3, 5, 13 |
| SSRF / DNS rebinding | `assertPublicUrl` / `safeFetch`; timeouts; size caps | Broader allowlists; injectable DNS for tests; redirect/rebinding deeper tests | 13 |
| Malicious attachments / imports | Limited size checks in places | Magic-byte validation, malware scan abstraction, ZIP traversal suite incomplete | 11, 12 |
| Model hallucination | Retrieval grounding + rule enforcers | No citation entailment verifier; hard-coded plans | 8, 9, 17 |
| Stale indexes | Local BM25 always; Pinecone optional | No readiness gate / drift reconciliation / freshness UX | 7, 16 |
| Duplicate side effects | Client `loading` flag | No server idempotency keys / turn constraints | 5, 12, 13 |
| Replay / CSRF | Some mutation CSRF helpers | Not uniformly enforced on all cookie mutations | 3 |
| Supply chain | Lockfile present | No CI secret scan/SAST/SBOM gates | 0, 19 |
| Fail-open auth | N/A when Auth0 configured | Entire middleware bypass if auth disabled/incomplete | 2, 3 |
| Fail-open vault | Hash may persist | Synthetic AWS reference when SDK missing | 3 |

## Trust boundaries

```
Browser ──(public docs)──► Next SSG / public APIs
Browser ──(session cookie)──► Proxy ──► Agent / Admin / Runner APIs
Agent ──► OpenAI / Pinecone (server keys only)
Runner ──► /api/run ──► allowlisted public destinations
Admin ──► Postgres control plane ──► (future) vault providers
```

**Untrusted:** user prompts, retrieved documentation text, attachments, imported OpenAPI/Postman, Zendesk ticket bodies (future).

**Trusted:** Auth0-verified identity, server-evaluated permissions, validated endpoint registry, pinned config flags.
