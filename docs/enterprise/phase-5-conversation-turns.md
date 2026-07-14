# Phase 5: Conversation and Turn Persistence

This phase adds server-owned persistence for agent conversations, turns, and messages. Every read and write is scoped by the trusted organization and user context; clients never supply either identity.

Each turn has an organization/user idempotency key and each turn can have only one `assistant_final` message, enforced by a partial unique database index. The store writes sanitized message text and removes sensitive, credential-like, and reasoning metadata keys. It stores user-visible status, final, and sanitized error messages only; it does not store chain-of-thought.

The conversation API creates, lists, retrieves, and starts turns. It is intentionally non-streaming: the existing `/api/agent` response contract remains unchanged, and a later phase can connect execution and final-message persistence with SSE without changing the persistence schema.

TODO: when the chat client owns a server `conversationId`, add a best-effort, non-blocking call to `/api/agent/conversations/:id/turns` before sending `/api/agent`. The current client only has local session identifiers, so wiring it now would require a larger conversation-creation flow.
