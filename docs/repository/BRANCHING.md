# Branching guide

## Default branch

`main` is the source of truth. Production Vercel product projects (CTIX, CFTR, CSAP, Orchestrate) are deployed from commits that land on `main` (or equivalent CLI deploy of that tree).

## Protected branches

Treat `main` as protected. Confirm GitHub branch protection / rulesets in the repository settings (requires authenticated `gh` or GitHub UI).

Do not force-push to `main`. Do not rewrite published history.

## Release strategy

No long-lived `release/*` branches are required today. Ship through `main` with Vercel production deploys per product project. If a release branch is introduced later, use `release/<version>` and keep it until maintenance ends.

## Feature branch lifecycle

```text
create from latest main
→ focused commits
→ push
→ open PR into main
→ pass CI
→ review
→ merge (prefer merge commit or squash per team preference; do not rewrite main)
→ delete the feature branch after merge
```

## Hotfix workflow

```text
hotfix/<short-description> from main
→ PR into main
→ deploy products
→ delete branch after merge
```

## Merge method

Use the repository’s GitHub merge button settings. Do not rewrite `main` with rebase/force-push. If squash merges are used, confirm content is on `main` before deleting the head branch (tip ancestry may fail after squash).

## Branch deletion policy

- Delete merged feature branches after merge when they have no open PRs and no unique commits.
- Never delete based only on age.
- Record tip SHAs before remote deletion.
- Use `archive/<name>/<YYYY-MM-DD>` annotated tags only when unique obsolete work must be preserved.
- Remote deletion requires an entry in `approved-branch-deletions.txt`.

## Archive-tag policy

Create archive tags only for unique historical work that is not already on `main`. Do not tag every merged branch.

## How to recover a deleted branch

When the tip SHA is known:

```bash
git switch -c <restored-branch-name> <tip-sha>
git push -u origin <restored-branch-name>
```

When an archive tag exists:

```bash
git switch -c <restored-branch-name> archive/<name>/<date>
git push -u origin <restored-branch-name>
```

Local reflog (not guaranteed on other machines):

```bash
git reflog
git switch -c <restored-branch-name> <sha>
```

## Naming convention

```text
feature/<short-description>
fix/<short-description>
hotfix/<short-description>
chore/<short-description>
docs/<short-description>
test/<short-description>
refactor/<short-description>
release/<version>
experiment/<short-description>
```

Rules: lowercase, hyphen-separated, concise. Avoid `test`, `changes`, `final`, `final2`, `work`. Prefer issue numbers when tracked (`feature/123-okta-user-provisioning`).

Legacy prefixes already present (`enterprise/`, `ui/`, `security/`) may remain until cleaned; new work should use the convention above.

## Examples

```text
feature/okta-docs-group-provisioning
fix/auth-callback-invalid-state
chore/branch-hygiene-docs
```
