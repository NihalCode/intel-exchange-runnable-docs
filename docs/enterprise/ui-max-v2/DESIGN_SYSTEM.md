# Design System — Signal Fabric 2.0 Tokens

Source of truth: `src/app/globals.css`

## Canvas / surfaces

`--canvas-base`, `--canvas-elevated`, `--canvas-atmospheric`, `--surface-editorial`, `--surface-operational`, `--surface-focused`, `--surface-floating`, `--surface-overlay`, `--surface-code`, `--surface-critical`, `--surface-inverse`

Legacy aliases retained: `--background-page`, `--surface-raised`, `--surface-sunken`, `--surface-muted`, `--surface-header`.

## Text / lines

`--text-primary|heading|secondary|muted|inverse|link` · `--line-subtle|default|strong|active` (aliased to `--border-*`)

## Brand / product / signal

`--brand-primary`, `--product-accent`, `--product-accent-soft`, `--signal-line`, `--signal-node`, `--signal-glow` plus `--product-ctix|csap|orchestrate|cftr`

## State

`--success|warning|danger|info` + soft variants · `--focus-ring`

## Elevation / motion

`--shadow-resting|focused|floating|modal` · `--motion-instant|fast|base|slow` · `--ease-standard|emphasized|exit`

## Materials (CSS classes)

| Class | Purpose |
|---|---|
| `.sf-atmosphere` | Soft product illumination |
| `.sf-grid-plane` | Technical grid mask |
| `.sf-product-module` | Product constellation tile |
| `.sf-signal-metric` | Analytics / telemetry metric |
| `.sf-workflow-ribbon` | Primary workflow paths |
| `.sf-code-surface` / `.sf-endpoint-identity` | API explorer |
| `.sf-access-plane` / `.sf-access-panel` | Access states |
| `.sf-telemetry-strip` | Responsive metric strip |

## Typography

Geist sans/mono. Display scale only on discovery. Tabular nums on analytics. Mono for code/IDs/paths/hosts.
