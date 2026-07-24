# Design System Adoption — Signal Fabric Completeness

## Principle

Evolve **existing** tokens in [`src/components/admin/ui/tokens.ts`](../../../src/components/admin/ui/tokens.ts) and materials in [`src/app/globals.css`](../../../src/app/globals.css). Do not invent a parallel token language.

## Mapping

| Legacy | Replacement |
|---|---|
| `buttonPrimaryClass` etc. | `SignalButton` variants (`primary`…`toolbar`) |
| raw `<button>` | `SignalButton` / `SignalIconButton` |
| `inputClass` + raw inputs | `SignalInput` / `SignalTextarea` / `SignalSelect` / `SignalSearch` |
| ad-hoc tabs | `SignalTabs` / `SignalSegmentedControl` |
| StatusBadge / pills | `SignalBadge` / `SignalStatus` |
| custom modals | `SignalDialog` (`security` for secrets) |
| side panels | `SignalDrawer` |
| EmptyState / ErrorState text | `SignalEmptyState` / `SignalErrorState` / `SignalPermissionState` |
| Loading text | `SignalSkeleton` |
| MetricCard | keep API; style via `.sf-signal-metric` or `SignalMetric` |
| DataTable | enhanced with `.sf-table-wrap` sticky headers |
| PageHeader | `SignalSectionHeader` |
| filter rows | `SignalFilterBar` |
| Build App toolbar | `SignalActionDock` |
| code panels | `SignalCodeSurface` / `.sf-code-surface` |

## New CSS utilities

`.sf-btn-primary`, `.sf-control`, `.sf-tabs`, `.sf-tab`, `.sf-segmented`, `.sf-dialog-backdrop`, `.sf-dialog-panel`, `.sf-drawer-panel`, `.sf-skeleton`, `.sf-filter-bar`, `.sf-action-dock`, `.sf-spinner`, `.sf-table-wrap`

## Barrel

Import from `@/components/fabric` or `@/components/ui`.

## Compatibility

`Button` → thin wrapper over `SignalButton`. Existing token class string exports remain for gradual migration.
