# Code-health analyzer

An AST-aware, provenance-resolving scanner for this repository. It distinguishes
*runtime* dangerous behaviour from text that merely mentions it, deduplicates
findings, and emits a transparent, reproducible health score.

## Commands

```bash
npm run health:scan    # write findings.json + score.json, print a summary
npm run health:check   # same, but exit non-zero if any OPEN critical/high remains (CI gate)
```

## What it detects (AST, not regex)

| Rule | Detection |
|---|---|
| `dynamic-eval` | real `eval(...)` call expressions |
| `dynamic-function-constructor` | `new Function(...)` / `Function(...)` |
| `command-execution` | `child_process` sinks (`spawn`/`exec`/…), resolved via import provenance so `RegExp.exec()` and `db.exec()` are NOT flagged |
| `xss-dangerous-html` | `dangerouslySetInnerHTML` JSX attributes |
| `debug-console` | real `console.log/debug/trace/info` calls (not text inside template literals) |
| `todo-comment` | `TODO`/`FIXME`/`HACK`/`XXX` in **comments only** (not string literals) |
| `long-file` | application files > 500 lines (informational review) |
| `circular-dependency` | import cycles across application source |

## Source classification

Findings are scored by role. `test`, `codegen`, `script`, and `analyzer` sources are
reported but never counted against the score; only `app` runtime source can produce
open findings.

## Score model

```
score = 100 − Σ(severityPenalty[severity] × categoryWeight[category])   over OPEN findings only
```

Penalties: critical 25, high 15, medium 6, low 2, info 0.5. Accepted / intentional-safe
/ fixture / generated findings contribute 0. See `detectors.mjs` for the exact tables.

## Accepted-risk register (`accepted.json`)

A finding can be accepted only with an owner, a written reason, a review date, and
(where a safety property is relied upon) a regression test. Entries are matched by
stable fingerprint `sha1(ruleId::file::symbol::line)[:12]`. Accepted findings are
surfaced in a separate metric and are never counted as open vulnerabilities.

## Ledger shape

`findings.json` contains `{ summary, findings: FindingRecord[] }`. Each record carries
`id`, `ruleId`, `category`, `severity`, `file`, `line`, `symbol`, `evidence`,
`sourceClass`, reachability flags, `classification`, and `status`.
