# Structural UI Replacement Ledger

Corrective rebuild: high-fidelity Cyware/techdocs **page grammar**, not token recoloring.  
Branch: `ui/structural-cyware-replica`

Status legend: `planned` → `building` → `reference_matched` → `functional` → `approved`

**Session status:** Core structural routes are `functional` locally (gates green). Production canary / full visual PNG overlays remain open → readiness `READY WITH DOCUMENTED UI LIMITATIONS`.

| route | oldComponent | oldGeometrySummary | referenceRoute | referencePattern | requiredStructuralChange | disposition | newComponent | status |
|-------|--------------|--------------------|----------------|------------------|--------------------------|-------------|--------------|--------|
| `*` | AppFrame | Flat sticky header; logo\|nav\|actions; lg sidebar + main | techdocs header | CYWARE\|TECHDOCS brand strip; compact actions; product context | Two-zone header + product strip + docs body frame | retain_with_structural_rewrite | CxAppShell / AppFrame v2 | functional |
| `/` | page.tsx | Hero blurb + search + 2×2 cards | techdocs hub | Full-width hero/search; product collection; API/release/resources; footer | Delete old composition; rebuild hub sections | replace | HomeHub | functional |
| `/docs/*` | Sidebar + DocsChrome | Left nav + article only | techdocs reader | Left tree · article · right TOC | Three-column DocsReaderFrame | retain_with_structural_rewrite | DocsReaderFrame | functional |
| search | DocsSearch | Inline dropdown only | techdocs search | Large hub + compact header + overlay | Overlay + filters + Ask AI escalate | replace | CxSearchOverlay | functional |
| endpoint | EndpointView | Token-polished endpoint stack | techdocs API | Method/path header; grouped params; example panes | New chrome around runner logic | retain_with_structural_rewrite | EndpointReferenceLayout | functional |
| `/agent` | AgentChat | Bordered card chat | adapted cyware AI | Workspace: nav \| canvas \| sources | Non-card workspace rails | retain_with_structural_rewrite | AskAiWorkspace | functional |
| Build App | AgentProjectPanel | Old project panel | n/a adapted | Resizable panels; mobile one-pane | Panel shell rewrite | retain_with_structural_rewrite | BuildAppWorkspace | functional |
| `/sign-in` | sign-in/page | Centered form | cyware enterprise | Split brand + form | Split layout | replace | SignInSplit | functional |
| `/authentication` | CredentialManager | Centered product forms | adapted | Composed sections + identity | Sectioned layout | retain_with_structural_rewrite | CredentialWorkspace | functional |
| `/guides` `/changelog` | pages | Simple lists | techdocs lists | Page header + filtered collections | CxPage headers | retain_with_structural_rewrite | CxPage shells | functional |
| `/settings/*` | settings | AppFrame forms | control plane | Toolbar + work area | Settings shell | retain_with_structural_rewrite | SettingsShell | functional |
| `/admin` | AdminFrame | Sidebar + header + cards | adapted control plane | Branded header; grouped nav; dense work area | New AdminFrame geometry | retain_with_structural_rewrite | AdminControlPlane | functional |
| analytics | QueryAnalytics* | Metric card grid | dense ops | Toolbar + reconciled metrics + table | New analytics layout | retain_with_structural_rewrite | AnalyticsWorkbench | functional |
| runners | runners.tsx | — | — | — | No visual-only rewrite of contracts | retain_logic_only | — | approved |

## Mandatory component list

| Component | disposition | notes |
|-----------|-------------|-------|
| AppFrame.tsx | retain_with_structural_rewrite | New `data-layout="cx-app-shell"` |
| AdminFrame.tsx / AdminHeader / AdminSidebar | retain_with_structural_rewrite | Control-plane grammar |
| Sidebar.tsx | retain_with_structural_rewrite | Tree geometry + rail |
| AgentChat.tsx / AgentChatSidebar / panels | retain_with_structural_rewrite | Workspace |
| CredentialManager.tsx | retain_with_structural_rewrite | Split/sections |
| Query Analytics / Unanswered / Weekly | retain_with_structural_rewrite | Workbench |
| RunSettings / RequestPlayground | retain_logic_only | Behavior frozen |

## Freeze

Backend contracts, Auth0/MFA/SSO, Viewer gates, SecretKey memory-only, analytics APIs — unchanged.
