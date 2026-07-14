# Phase 7: Hybrid Retrieval and Visible Degradation

Agent retrieval begins with the local BM25 index. When vector retrieval is available, its ranked Pinecone matches are fused with lexical matches using reciprocal-rank fusion (RRF), rather than replacing local results. This preserves high-value exact documentation matches while allowing semantic matches to contribute.

Responses now include `retrievalEvidence` (`strong_match`, `partial_match`, `limited_evidence`, or `no_verified_match`) and `retrievalMode` (`hybrid`, `lexical`, or `degraded_lexical`). `retrievalDegraded` is set if a requested vector path fails or becomes unavailable, including when local hybrid retrieval successfully cushions the failure. The legacy numeric `confidence` remains for compatibility but is derived from the coarse evidence level, not from a raw similarity score.

Broad global query expansions that could redirect unrelated requests (for example, `all` to bulk actions, a generic `file` to indicators, or categories to tags) were removed. Product-specific expansions remain responsible for product vocabulary.

Provider response bodies are also sanitized at the agent boundary so OpenAI diagnostics are not included in user-visible errors.
