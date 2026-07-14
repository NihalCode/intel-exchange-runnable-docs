# Phase 14 — Accessibility

The documentation and enterprise-admin shells now provide skip links to their
main landmarks, named navigation regions, and a consistent visible keyboard
focus treatment. Product and project selectors, endpoint filtering, and agent
controls have explicit accessible names.

Agent processing and attachment status use polite live announcements; errors
use assertive alerts. Modal dialogs and mobile navigation drawers trap keyboard
focus, support Escape to close, and restore focus to the invoking control.

Motion-sensitive users are respected by disabling smooth scrolling and
decorative animation/transition timing when `prefers-reduced-motion` is set.
