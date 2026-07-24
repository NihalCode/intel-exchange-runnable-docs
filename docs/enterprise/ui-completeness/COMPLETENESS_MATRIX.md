# Completeness Matrix

Values from code inspection after Signal kit + cluster migrations (2026-07-24).  
`Complete=true` only when primary controls/states use Signal primitives or elevated Fabric materials.

| Route | Tabs | Panes | Buttons | Forms | Tables | Overlays | States | Light | Dark | Mobile | A11y | Complete |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | — | 1 | partial | search | — | palette | ok | Y | Y | Y | Y | false |
| `/sign-in` | — | 2 | token | — | — | — | ok | Y | Y | Y | Y | false |
| `/sign-up` | — | 2 | Signal* | Signal* | — | — | ok | Y | Y | Y | Y | false |
| `/access/*` | — | 1 | token CTA | — | — | — | ok | Y | Y | Y | Y | false |
| `/settings/users` | — | 1 | Signal* | Signal* | Signal* | — | Signal* | Y | Y | Y | Y | **true** |
| `/settings/content` | — | 1 | Signal* | Signal* | — | — | Signal* | Y | Y | Y | Y | **true** |
| `/docs/...` | code | 3 | Run Signal* | creds Signal* | params | — | partial | Y | Y | Y | Y | false |
| `/agent` Ask | — | 3 | partial | composer | — | drawer | partial | Y | Y | Y | Y | false |
| `/agent` Build | stages | 4 | Signal dock | — | files | deploy | partial | Y | Y | Y | Y | false |
| `/admin` | — | 1 | — | — | — | — | metrics | Y | Y | Y | Y | false |
| `…/query-analytics` | — | 1 | Signal* | SignalFilter | events | — | Signal* | Y | Y | Y | Y | **true** |
| `…/unanswered` | — | 1 | Signal* | — | list | reveal | partial | Y | Y | Y | Y | false |
| `…/keys` | — | 1 | token | create | DataTable | SignalDialog | ok | Y | Y | Y | Y | false |
| Admin ops (apis/schemas/deployments/domains/jobs/logs/features) | — | 1 | mixed | mixed | DataTable | mixed | mixed | Y | Y | partial | Y | false |
| Guides/changelog/developer | — | 1 | — | — | — | — | — | Y | Y | Y | Y | false |

**Major routes still incomplete:** Ask AI composer/drawer depth, nested admin forms, secondary public pages, full mobile pane compositions for admin workbenches.
