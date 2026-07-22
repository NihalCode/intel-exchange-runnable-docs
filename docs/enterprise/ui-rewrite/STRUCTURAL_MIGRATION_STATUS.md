# Structural Cyware Replica — Migration Status

Branch: `ui/structural-cyware-replica`  
Corrective rebuild superseding token-only Waves A–E.

| Route | Old layout | New layout | Status |
|-------|------------|------------|--------|
| `*` AppFrame | Flat sticky header + always-on sidebar | Brand zones + product strip + docs rail only on `/docs` | `responsive_complete` |
| `/` | Hero blurb + 2×2 cards | Hub hero + 4-col product collection + resources + footer | `visual_approved` (local) |
| Search | Dropdown only | Hub / compact / overlay + Ask AI escalate | `components_migrated` |
| `/docs/*` | Article column + left nav | Left rail · article · right TOC (xl) | `responsive_complete` |
| Endpoint | Polished stack | `cx-endpoint-reference` wrapper; runners retained | `components_migrated` |
| `/agent` | Bordered card chat | `cx-ask-workspace` three-region grid | `components_migrated` |
| Build App | Zinc project panel | `cx-build-app-panel` | `components_migrated` |
| `/sign-in` | Centered card | Split brand + form | `visual_approved` (local) |
| `/authentication` | Narrow forms | `cx-credential-workspace` | `components_migrated` |
| Guides / Changelog | Mixed zinc | Token + layout markers + footer on hub routes | `components_migrated` |
| `/admin` | Light sidebar + header | Dark nav rail + work area + toolbar | `components_migrated` |
| Query analytics / unanswered / weekly | Card grids | Workbench layout markers | `components_migrated` |

## Feature flag

`enterprise_ui_v2` remains default ON (structural system live on this branch).

## Deferred

- Production canaries (CTIX / CFTR / CSAP / Orchestrate / admin)
- Playwright visual overlay suite vs rejected baseline PNGs
- Full pixel measurement session against live techdocs at every viewport
