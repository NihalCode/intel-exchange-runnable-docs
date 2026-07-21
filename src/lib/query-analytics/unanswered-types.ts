export interface UnansweredSummary {
  refreshedAt: string;
  totalOpen: number;
  totalNew: number;
  byStatus: Record<string, number>;
  byOutcome: Record<string, number>;
  byProduct: Record<string, number>;
  /** Opaque cursor for stale detection — not sensitive. */
  fingerprint: string;
}

export interface WeeklySnapshotRow {
  id: string;
  weekStart: string;
  productId: string | null;
  hostname: string | null;
  outcome: string | null;
  status: string | null;
  reviewCount: number;
  newCount: number;
  fixedCount: number;
  createdAt: string;
  updatedAt: string;
}
