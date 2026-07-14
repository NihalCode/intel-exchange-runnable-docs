# Phase 9: Agent Answer UX

Each completed chat turn renders one canonical final-answer card. The temporary progress indicator is only shown while the request runs and filters internal routing labels.

The card uses Phase 7's coarse `retrievalEvidence` labels instead of displaying numeric confidence. When vector retrieval degrades, it includes a short notice that documentation search is using the local index and results may be more limited. Internal retrieval modes and router diagnostics remain hidden.
