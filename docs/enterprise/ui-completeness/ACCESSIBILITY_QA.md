# Accessibility QA

Target: WCAG 2.2 AA for redesigned controls.

| Surface | Keyboard | Focus visible | Labels | Escape/trap | Live regions | Reduced motion | Notes |
|---|---|---|---|---|---|---|---|
| SignalButton | Y | ring tokens | text/aria | — | aria-busy | spinner off | pass |
| SignalTabs | arrows | Y | aria-selected | — | — | Y | pass |
| SignalDialog | Y | initial focus | labelledby | Escape + return | — | — | light trap |
| SignalDrawer | Y | — | labelledby | Escape | — | — | pass |
| Users form | Y | Y | Signal labels | — | status msgs | Y | pass |
| Query analytics filters | Y | Y | labels | — | load error | Y | pass |
| One-time secret | Y | Y | dialog | Escape | — | — | security panel |
| Ask AI composer | partial | Y | partial | — | streaming | Y | **follow-up** |
| DataTable | sort buttons | Y | caption sr-only | — | — | Y | pass |
| Access pages | links | Y | headings | — | — | Y | pass |

## Known follow-ups

1. Full focus-trap library not used — dialogs use first-focusable + Escape.
2. Ask AI feedback / citation drawer still need deeper a11y pass.
3. Chart/metric summaries rely on text labels (MetricCard) — ok for now.
