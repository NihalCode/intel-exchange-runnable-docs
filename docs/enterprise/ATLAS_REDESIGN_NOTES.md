# Living Signal Atlas — redesign notes

Visual/interaction migration completed in-app (not a `/demo` prototype).

## Verified

- `npx tsc --noEmit` — pass
- `npm run build` — pass
- Atlas shell e2e (`e2e/auto-hide-top-navigation.spec.ts`) — 10/10 pass
- Unit tests — 1525 pass; 1 pre-existing flake in `unanswered-query-lifecycle` weekly snapshots (unrelated to UI)
- Lint on Atlas touchpoints — no new errors (repo-wide lint still hits untracked `.tmp-*` scratch files)

## Visual QA (local production server)

Inspected: `/`, `/docs/ctix/ping/ping`, `/agent`, `/sign-in` — command rail + bar, dark-first mineral theme, docs knowledge tree, Ask Intelligence gate, TrustOrbit sign-in.

## Residual limitations

1. **Desktop auto-hide top chrome retired** — replaced by persistent CommandRail + CommandBar. Pure helpers in `top-chrome-state.ts` remain for unit tests; UI no longer mounts `TopChromeProvider` in AppFrame.
2. **Agent empty/gated state** still uses SignalField atmosphere art; full three-column workstation appears after product credentials are connected.
3. **Chart library** not added — analytics/unanswered use custom SVG/CSS telemetry ribbons rather than a new chart dependency.
4. **Light mode** is a day-operations mineral variant; Atlas is dark-first (`theme-init.js` defaults to dark).
5. **Deploy to production hosts** not performed in this wave — ship via normal `main` push when ready.
