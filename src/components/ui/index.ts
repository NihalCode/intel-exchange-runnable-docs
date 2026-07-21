/**
 * Thin docs-facing re-exports of admin/ui primitives.
 * Do not duplicate the admin system — upgrade tokens there instead.
 */
export {
  buttonPrimaryClass,
  buttonSecondaryClass,
  buttonDangerClass,
  buttonGhostClass,
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
