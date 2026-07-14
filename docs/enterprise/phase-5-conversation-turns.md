# Phase 5: Conversation and Turn Persistence

This phase adds server-owned persistence for agent conversations, turns, and messages. Every read and write is scoped by the trusted organization and user context; clients never supply either identity.

Each turn has an organization/user idempotency key and each turn can have only one `assistant_final` message, enforced by a partial unique database index. The store writes sanitized message text and removes sensitive, credential-like, and reasoning metadata keys. It stores user-visible status, final, and sanitized error messages only; it does not store chain-of-thought.

The conversation API creates, lists, retrieves, and starts turns. Authenticated chat sessions now persist their server `conversationId` alongside the local session and best-effort start a turn before sending `/api/agent`; failure to use these APIs leaves the local chat fully functional. Turn idempotency is derived from the local session and user-message identifiers. Only user-authored text is submitted for the turn, so in-memory attachment extraction is not persisted.

The API remains intentionally non-streaming: the existing `/api/agent` response contract is unchanged. The client records the latest server turn id for future streaming/finalization work; a later phase can complete the turn with its assistant final message without changing the persistence schema.
