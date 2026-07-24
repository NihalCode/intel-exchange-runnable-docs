# Visual QA

## Evidence mode

Code-level + component inspection. Screenshot pack not committed (avoid binary bloat). Spot-check recommended on CTIX preview after deploy.

## Surfaces reviewed

| Surface | Before | After | Verdict |
|---|---|---|---|
| Users management | zinc table, raw inputs | Signal form/table/status/skeleton | Improved |
| Content management | zinc cards/sky buttons | SignalDetailPanel + Signal controls | Improved |
| Query analytics filters | bordered toolbar | SignalFilterBar + Signal inputs | Improved |
| Unanswered actions | zinc/amber raw buttons | SignalButton toolbar | Improved |
| Build App dock | raw toolbar buttons | SignalActionDock | Improved |
| Run / credentials | sky/zinc runner chrome | SignalButton + SignalInput | Improved |
| One-time secret | custom modal | SignalDialog security | Improved |
| Home / sign-in | prior Fabric wave | retained | Stable |
| Ask AI depth | shell elevated | composer/drawer still custom | Incomplete |
| Nested admin forms | PageHeader + DataTable | partial kit | Incomplete |

## Themes

Light/dark token paths used throughout Signal kit (`--surface-*`, `--text-*`). Zinc residue reduced on migrated panels; remaining zinc in ResultBox / some agent chrome.
