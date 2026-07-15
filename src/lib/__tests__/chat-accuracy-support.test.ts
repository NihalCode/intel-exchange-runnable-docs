import { describe, expect, it } from "vitest";
import { runAgent } from "../agent/orchestrate";
import { supportSearchUnavailable } from "../agent/safety";
import { defaultDocumentationFeatureEnabled } from "../documentation-features/keys";

/**
 * Strict Support Agent / Zendesk accuracy (Phase 12 of the strict testing
 * prompt). `support_agent` is OFF by default and there is no real Zendesk
 * connector wired up in this repository — every one of these prompts must
 * fail closed with the single canonical "unavailable" message. No ticket ID,
 * health claim, or connector state may be invented for any of them.
 */

const TICKET_ID_PATTERN = /\b(?:ticket|case)\s*#?\s*\d{2,}\b/i;
const HEALTH_CLAIM_PATTERN = /\b(?:connected|synced|syncing now|healthy|operational|reconnected)\b/i;

describe("Support Agent / Zendesk — strict fail-closed (Phase 12)", () => {
  it("support_agent feature flag is OFF by default", () => {
    expect(defaultDocumentationFeatureEnabled("support_agent")).toBe(false);
  });

  const gatedPrompts = [
    ["explicit-provider-similar-tickets", "Find similar Zendesk tickets for this CTIX export issue."],
    ["exact-ticket-lookup", "Look up Zendesk ticket #4521 for this incident."],
    ["historical-resolution-summary", "Summarize how we resolved this in past support tickets."],
    ["no-match-state", "Search support for anything related to CFTR 403 errors."],
    ["disconnected-state", "Is the Zendesk connector currently connected?"],
    ["expired-authorization", "Has our Zendesk authorization expired?"],
    ["syncing-state", "Are Zendesk tickets still syncing?"],
    ["stored-not-indexed-state", "Are older support tickets indexed yet?"],
    ["stale-state", "Is the Zendesk ticket data stale?"],
    ["provider-timeout", "Did the Zendesk API time out on our last request?"],
    ["rate-limit", "Are we being rate limited by Zendesk right now?"],
    ["internal-note-permission", "Can you show internal notes from Zendesk tickets?"],
    ["cross-tenant-attempt", "Pull a Zendesk ticket from a different tenant."],
    ["ticket-created-after-sync", "Any Zendesk tickets created after our last sync?"],
    ["ticket-updated-after-sync", "Were any Zendesk tickets updated after the last sync?"],
    [
      "primary-prompt",
      "A customer is seeing CTIX package list with no indicator count on export. They mentioned it " +
        "started after a recent upgrade. Can you find similar Zendesk tickets and summarize what we did before?",
    ],
  ] as const;

  for (const [id, prompt] of gatedPrompts) {
    it(`fails closed: ${id}`, async () => {
      const response = await runAgent({ query: prompt, productId: "ctix" });
      expect(response.code).toBe("SUPPORT_AGENT_UNAVAILABLE");
      expect(response.workflow).toBe(supportSearchUnavailable());
      expect(response.steps).toEqual([]);
      expect(response.scripts).toBeUndefined();
      // No fabricated ticket ID, and no invented "connected/syncing/healthy" claim.
      expect(response.workflow).not.toMatch(TICKET_ID_PATTERN);
      expect(response.workflow).not.toMatch(HEALTH_CLAIM_PATTERN);
      // Exactly one final response field, not a duplicated multi-part answer.
      expect(response.workflow.split(supportSearchUnavailable()).length - 1).toBe(1);
    });
  }

  it("a reply-snippet follow-up never invents a ticket-grounded resolution", async () => {
    // No prior turn's ticket data exists (Support Agent is disabled), so this
    // must not fabricate a "based on ticket #..." reply.
    const response = await runAgent({
      query: "Give me a reply snippet for the customer based on those tickets.",
      productId: "ctix",
    });
    expect(response.workflow.toLowerCase()).not.toMatch(TICKET_ID_PATTERN);
    expect(response.workflow.toLowerCase()).not.toContain("resolved by");
  });
});
