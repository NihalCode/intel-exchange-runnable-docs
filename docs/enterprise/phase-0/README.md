# Phase 0 — Secure Intake, Inventory, and Risk Map

**Branch:** `enterprise/phase-0-intake`  
**Status:** Intake complete — remediation begins at Phase 1 after this inventory is accepted.  
**Date:** 2026-07-13

## Goal

Create a trustworthy source tree and a complete architecture/risk inventory before remediation. No broad product-feature implementation until exit criteria below are met.

## Deliverables in this folder

| Document | Purpose |
|---|---|
| [ROUTE_ACCESS_MATRIX.md](./ROUTE_ACCESS_MATRIX.md) | Every route: access class, permission, cache, audit |
| [FEATURE_INVENTORY.md](./FEATURE_INVENTORY.md) | Features, flags, REAL/MOCK/GATED classification |
| [ROOT_CAUSE_MAP.md](./ROOT_CAUSE_MAP.md) | Observed failures → root causes (not symptoms) |
| [THREAT_MODEL.md](./THREAT_MODEL.md) | Threat categories and current controls/gaps |
| [ARCHITECTURE_NOTES.md](./ARCHITECTURE_NOTES.md) | Data-flow notes for key paths |
| [BASELINE.md](./BASELINE.md) | Clean-install command results |
| [REMEDIATION_SEQUENCE.md](./REMEDIATION_SEQUENCE.md) | Ordered phase plan with any justified reorders |

## Safe handling

- Never commit `.env*`, `.data/`, `.next/`, `node_modules/`, OAuth/SQLite stores, or MCP secrets.
- Use `npm run security:scan-secrets` and `npm run archive:check` before export/release.
- See `scripts/security/artifact-allowlist.json` and `scripts/security/scan-secrets.mjs`.

## Phase 0 exit checklist

- [x] Clean branch created (`enterprise/phase-0-intake`)
- [x] Route + feature inventories written
- [x] Threat model + root-cause map written
- [x] Remediation sequence written
- [x] Clean install + recorded baselines (see BASELINE.md)
- [x] Sensitive path patterns enforced in `.gitignore` + allowlist tooling
- [x] Artifact-content unit test added
