# Responsive QA

Breakpoints checked via layout CSS + component composition (code inspection). Full device lab screenshots not captured in-repo.

| Breakpoint | Home | Auth | Docs | Agent | Users | Analytics | Admin ops |
|---|---|---|---|---|---|---|---|
| 1600 | ok | ok | 3-pane | studio | wide table | filter wrap | sidebar |
| 1440 | ok | ok | ok | ok | ok | ok | ok |
| 1280 | ok | ok | ok | ok | ok | ok | ok |
| 1024 | ok | ok | nav collapse | panel shrink | ok | wrap | collapse |
| 900 | stack | stack | stack | stack | form 2-col | wrap | stack |
| 768 | mobile nav | full form | article first | chat first | stack | stack | drawer nav |
| 640 | ok | ok | ok | ok | ok | ok | cramped |
| 430–360 | touch targets ≥36px on SignalButton sm | ok | code scroll | composer sticky | table scroll | filter stack | **needs denser QA** |

## Notes

- SignalFilterBar / SignalActionDock wrap by design (`flex-wrap`).
- Users table uses `.sf-table-wrap` horizontal scroll on narrow viewports.
- Admin ops mobile remains the weakest cluster (not merely shrunk — but not fully redesign-composed).
