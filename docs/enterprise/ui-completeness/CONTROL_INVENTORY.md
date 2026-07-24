# Control Inventory (mutation + primary actions)

| Route | Control | Type | Variant | Loading | Disabled | Error | Keyboard | Mobile | Updated |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| users | Add user | SignalButton | primary | Y | Y | form | Y | Y | Y |
| users | Change role | SignalSelect | — | — | Y | inline | Y | Y | Y |
| users | Disable | SignalButton | danger | Y | Y | inline | Y | Y | Y |
| content | Sync from source | SignalButton | primary | Y | Y | SignalError | Y | Y | Y |
| content | Import & write | SignalButton | primary | Y | Y | SignalError | Y | Y | Y |
| query-analytics | Apply filters | SignalButton | primary | — | — | — | Y | Y | Y |
| query-analytics | Export CSV | link | secondary | — | — | — | Y | Y | Y |
| unanswered | Reveal exact query | SignalButton | toolbar | Y | Y | alert | Y | Y | Y |
| unanswered | Status workflow | SignalButton | toolbar | — | Y | — | Y | Y | Y |
| keys/apis | Create / rotate | page buttons | mixed | — | — | — | Y | Y | partial |
| keys | One-time secret | SignalDialog | security | — | — | — | Escape | Y | Y |
| Build App | Preview/Deploy/Commit/Download | SignalButton | toolbar/primary | Y | Y | — | Y | Y | Y |
| runners | Run | SignalButton | primary/danger/ghost | Y | Y | — | Y | Y | Y |
| runners | Extra creds | SignalInput | password | — | — | — | Y | Y | Y |
| access | Back to sign in | anchor | primary class | — | — | — | Y | Y | partial |
| Ask AI | Send/Stop/Feedback | custom | mixed | Y | Y | — | Y | Y | N |

Additional admin mutation controls (promote deployment, attach domain, feature toggles, schema activate) remain on token/class buttons — tracked OPEN in LEGACY_SURFACE_LEDGER.
