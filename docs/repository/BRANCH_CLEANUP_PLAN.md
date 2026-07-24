# Branch cleanup plan (dry-run)

**Date:** 2026-07-24  
**Operator:** Cursor agent (local audit)  
**Repository:** https://github.com/NihalCode/intel-exchange-runnable-docs  
**Default branch:** `main` @ `1cb70ba55ea449b7b421fd149b982500d0744fce`  
**Current branch:** `main`  

```text
No branch has been deleted during the audit phase.
```

## Blockers before remote deletion

| Check | Status |
|---|---|
| Remote is GitHub | Yes — `github.com/NihalCode/intel-exchange-runnable-docs` |
| `gh` authenticated | **No** — `gh auth status` reports invalid keyring token (HTTP 401) |
| Open PRs inspected | **Blocked** — re-run after `gh auth login` |
| Branch protection inspected | **Blocked** — re-run after `gh auth login` |
| Worktrees | Only primary worktree on `main` |

**Do not run remote deletions until:** `gh auth login` succeeds, open PRs are empty for candidates, and a human approves `docs/repository/approved-branch-deletions.txt`.

## Inventory

| Branch | Local/Remote | Tip SHA | Ahead/Behind main | Ancestor of main | PR | Protected | Deployment / workflow | Unique commits | Decision | Risk | Evidence |
|---|---|---|---:|---|---|---|---|---:|---|---|---|
| `main` | both | `1cb70ba` | 0 / 0 | yes | n/a | unknown (gh 401) | Production Vercel deploys + CI on `main` | 0 | KEEP_PROTECTED / KEEP_ACTIVE | high | Default branch; source of truth |
| `ui/structural-cyware-replica` | both | `1cb70ba` | 0 / 0 | yes | unknown | unknown | Not named in workflows; tip identical to `main` | 0 | DELETE_LOCAL_MERGED + DELETE_REMOTE_MERGED (pending approval) | low | Fast-forwarded into `main` 2026-07-24 |
| `enterprise/auth0-gated-completion` | both | `f1ade6e` | 0 / 98 | yes | unknown | unknown | CI pattern `enterprise/**` (generic) | 0 | DELETE_*_MERGED (pending approval + PR check) | medium | Tip is ancestor of `main` |
| `enterprise/chat-accuracy-validation` | both | `aa6bc50` | 0 / 95 | yes | unknown | unknown | CI `enterprise/**` | 0 | DELETE_*_MERGED (pending) | medium | Ancestor of `main` |
| `enterprise/codeflow-fp-and-hardening` | both | `8835e18` | 0 / 45 | yes | unknown | unknown | CI `enterprise/**` | 0 | DELETE_*_MERGED (pending) | medium | Ancestor of `main` |
| `enterprise/codeflow-persistent-findings` | both | `51bcbd0` | 0 / 46 | yes | unknown | unknown | CI `enterprise/**` | 0 | DELETE_*_MERGED (pending) | medium | Ancestor of `main` |
| `enterprise/final-production-testing` | both | `286dcb6` | 0 / 94 | yes | unknown | unknown | CI `enterprise/**` | 0 | DELETE_*_MERGED (pending) | medium | Ancestor of `main` |
| `enterprise/phase-0-meetup` | both | `a4fb389` | 0 / 101 | yes | unknown | unknown | CI `enterprise/**` | 0 | DELETE_*_MERGED (pending) | medium | Ancestor of `main` |
| `enterprise/security-hardening` | both | `cf94f24` | 0 / 48 | yes | unknown | unknown | CI `enterprise/**` | 0 | DELETE_*_MERGED (pending) | medium | Ancestor of `main` |
| `enterprise/security-residuals` | both | `a0e3079` | 0 / 47 | yes | unknown | unknown | CI `enterprise/**` | 0 | DELETE_*_MERGED (pending) | medium | Ancestor of `main` |
| `enterprise/tester-fixer-polisher` | both | `f221c06` | 0 / 49 | yes | unknown | unknown | CI `enterprise/**` | 0 | DELETE_*_MERGED (pending) | medium | Ancestor of `main` |
| `security/health-score-remediation` | both | `6459eac` | 0 / 86 | yes | unknown | unknown | Not specially referenced | 0 | DELETE_*_MERGED (pending) | medium | Ancestor of `main` |

Merge evidence for every non-`main` branch above: `git merge-base --is-ancestor <tip> main` succeeded and `git rev-list --count main..<branch>` is `0`.

## Command groups (do not execute remotes until approved)

### Safe local deletions (after approval)

```bash
git branch -d ui/structural-cyware-replica
git branch -d enterprise/auth0-gated-completion
git branch -d enterprise/chat-accuracy-validation
git branch -d enterprise/codeflow-fp-and-hardening
git branch -d enterprise/codeflow-persistent-findings
git branch -d enterprise/final-production-testing
git branch -d enterprise/phase-0-meetup
git branch -d enterprise/security-hardening
git branch -d enterprise/security-residuals
git branch -d enterprise/tester-fixer-polisher
git branch -d security/health-score-remediation
```

### Safe remote deletions (after `gh` PR check + approval allowlist)

Record tip SHAs from the table, then:

```bash
git push origin --delete ui/structural-cyware-replica
# …one branch at a time from approved-branch-deletions.txt
```

### Archive-then-delete

None required — no unique unmerged commits found on listed tips.

### Branches requiring review

- All remote candidates until open PRs and protection rules are inspected with a working `gh` session.
- Any branch another developer still uses for worktrees (none found locally).

### Branches kept

- `main` (default / production source of truth)

## Pre-approval checklist

1. Run `gh auth login -h github.com`
2. `gh pr list --state open` — ensure candidates have no open PRs
3. Inspect branch protection / rulesets
4. Copy approved names into `approved-branch-deletions.txt`
5. Execute Phase 8 from the master prompt (allowlist only)
