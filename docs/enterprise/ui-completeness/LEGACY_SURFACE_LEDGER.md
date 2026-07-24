# Legacy Surface Ledger

Severity: **P0** mutation/destructive hierarchy · **P1** forms/tables · **P2** overlays/states · **P3** polish.

| route | component | surface | problem | severity | replacement | status |
|---|---|---|---|---|---|---|
| `/settings/users`, `…/users` | UsersManagementPanel | form/table | was ad-hoc zinc inputs | P0 | SignalInput/Select/Button/Table | **DONE** |
| `/agent` | AgentChat* | composer/drawer | custom chrome, inconsistent buttons | P0 | SignalButton, SignalDrawer, SignalTextarea | OPEN |
| `/agent` | AgentProjectPanel | Build App dock | mixed toolbar buttons | P1 | SignalActionDock + SignalButton | **DONE** |
| docs endpoints | RequestPlayground / runners | Run + creds | one-off inputs/buttons | P0 | SignalInput, SignalButton | **DONE** (RunButton + ManualCredentialsForm) |
| `…/query-analytics` | QueryAnalyticsPage | filters | plain form + MetricCard grid | P1 | SignalFilterBar, SignalMetric | **DONE** (filters; MetricCard retained) |
| `…/unanswered` | UnansweredQueriesPage | row actions / reveal | plain buttons; security overlay | P0 | SignalButton, SignalDialog(security) | **DONE** (actions; reveal panel still amber) |
| `…/keys` | DocumentationAgentKeysPage | one-time secret | modal security surface | P0 | SignalDialog security | **DONE** |
| `/settings/content` | ContentManagementPanel | ingest UI | bordered cards + raw controls | P1 | SignalSectionHeader + Signal* | **DONE** |
| `/guides` etc. | page.tsx | secondary public | generic cards | P3 | sf materials | OPEN |
| access/* | AccessPage | CTAs | mostly elevated; verify SignalButton | P2 | SignalButton | OPEN |
| global | many | `bg-zinc` / `dark:border-zinc` | leftover zinc residue | P2 | semantic tokens | OPEN |
| global | MetricCard | metrics | elevated but not SignalMetric everywhere | P2 | SignalMetric | OPEN |
| ui-max gap | Ask AI | floating command | incomplete rebuild | P1 | SignalActionDock / Dialog | OPEN |
| ui-max gap | Users | action drawer | denser status-stack deferred | P2 | SignalDrawer | OPEN |
| ui-max gap | API explorer | focus mode | not shipped | P3 | layout toggle | OPEN |

## rg pattern families (src)

- `rounded-lg border` / `border rounded` — cards and panels
- `bg-zinc` / `text-zinc` — residual neutrals (users table fixed)
- `MetricCard` / `PageHeader` / `DataTable` / `EmptyState` / `StatusBadge` — shared admin primitives (elevate, don’t delete)
- Raw `<button>` / `<input>` outside tokens — highest volume in agent + runners + admin forms

## Migration priority order

1. Mutation buttons & destructive actions  
2. Forms / credential fields  
3. Tables & metric grids  
4. Overlays (secret reveal, confirm)  
5. Empty/loading/error/permission  
6. Nested admin polish  
