# Analytics and reCAPTCHA UX

## Query Analytics

- Presentation upgraded to `sf-signal-metric` / telemetry strip
- Labels and percentages still derived from existing `QueryAnalyticsMetrics`
- Answer-quality denominator copy unchanged
- Filters, CSV export, sensitive CSV permission gate unchanged

## Unanswered triage

- Summary cards use signal metric material when realtime summary is enabled
- Review statuses, reveal controls, and manage permissions unchanged
- Weekly analytics link/feature gate unchanged

## reCAPTCHA

- No policy or action changes (`ask_ai_submit`, `feedback_submit`, `public_invite`)
- Degraded Ask AI / feedback remain fail-soft (existing behavior)
- Public invite remains fail-closed when configured
- No checkbox/challenge UI introduced for v3
- No secrets/site keys rendered
