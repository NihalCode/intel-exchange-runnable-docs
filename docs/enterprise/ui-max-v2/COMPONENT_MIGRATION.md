# Component Migration

| Changed File | Visual Responsibility | Logic Preserved | Tests |
|---|---|---|---|
| `src/app/globals.css` | Signal Fabric 2.0 tokens, materials, motion | N/A (CSS) | token + structural CSS markers |
| `src/components/fabric/SignalField.tsx` | Topology art, verification nodes, ribbons | Decorative only | visual |
| `src/components/fabric/CommandPalette.tsx` | Permission-aware navigation palette | Existing routes/permissions | a11y keyboard |
| `src/components/AppFrame.tsx` | Brand glow, product strip, palette mount | Nav/auth gates unchanged | frame tests |
| `src/app/page.tsx` | Cinematic home | Product registry + DocsSearch | structural home |
| `src/components/cx/index.tsx` | Product modules | Link targets unchanged | product card markers |
| `src/app/sign-in/page.tsx` | Security split | Fresh-login / signup hrefs | split-auth markers |
| `src/app/sign-up/page.tsx` | Security split | OktaSignUpForm | layout markers |
| `src/components/auth/AccessPage.tsx` | Access plane | Sign-in / browse hrefs | access testids |
| `src/components/EndpointView.tsx` | Method accent + code path bar | Request playground | endpoint behavior |
| `src/components/AgentChat.tsx` | Intelligence header | Chat state machine | ask workspace marker |
| `src/components/AgentProjectPanel.tsx` | Build studio dock | Deploy/commit/preview handlers | build panel marker |
| `src/components/auth/UsersManagementPanel.tsx` | Identity command UI | `/api/users` flows | users testids |
| `src/components/admin/ui/MetricCard.tsx` | Signal metric material | Props unchanged | metric-card testid |
| `src/components/admin/ui/PageHeader.tsx` | Operational header | Props unchanged | — |
| `src/components/admin/pages/AdminOverviewPage.tsx` | Dashboard topology | metrics/health/activity data | — |
| `src/components/admin/pages/QueryAnalyticsPage.tsx` | Telemetry presentation | Metric math / CSV | analytics workbench |
| `src/components/admin/pages/UnansweredQueriesPage.tsx` | Triage presentation | Review/reveal APIs | unanswered workbench |

No Auth0/Okta/session logic files were modified for behavior.
