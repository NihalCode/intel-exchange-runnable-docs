/**
 * Thin docs-facing re-exports of admin/ui primitives + Signal Fabric kit.
 * Prefer Signal* components for new UI.
 */
export {
  buttonPrimaryClass,
  buttonSecondaryClass,
  buttonTertiaryClass,
  buttonDangerClass,
  buttonSuccessClass,
  buttonGhostClass,
  buttonQuietClass,
  buttonToolbarClass,
  buttonIconClass,
  cardClass,
  inputClass,
  linkClass,
  navLinkClass,
  navLinkActiveClass,
  pageTitleClass,
  eyebrowClass,
  mutedTextClass,
  focusRing,
  productAccentClass,
  productAccentVar,
} from "@/components/admin/ui/tokens";

export { PageHeader, StatusMessage } from "@/components/admin/ui/PageHeader";
export { EmptyState, ErrorState, LoadingSkeleton } from "@/components/admin/ui/EmptyState";
export { MetricCard } from "@/components/admin/ui/MetricCard";
export { DataTable } from "@/components/admin/ui/DataTable";
export type { DataTableColumn, DataTableProps } from "@/components/admin/ui/DataTable";
export { Button } from "@/components/ui/Button";

export {
  SignalButton,
  SignalIconButton,
  SignalInput,
  SignalTextarea,
  SignalSelect,
  SignalCheckbox,
  SignalSwitch,
  SignalSearch,
  SignalTabs,
  SignalSegmentedControl,
  SignalBadge,
  SignalStatus,
  SignalDialog,
  SignalDrawer,
  SignalSkeleton,
  SignalEmptyState,
  SignalErrorState,
  SignalPermissionState,
  SignalSectionHeader,
  SignalFilterBar,
  SignalActionDock,
  SignalCodeSurface,
  SignalDetailPanel,
  SignalMetric,
} from "@/components/fabric";
