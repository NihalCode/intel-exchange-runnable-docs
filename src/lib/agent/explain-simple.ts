import type { AgentResponse } from "./types";
import { parseDateRangeFromQuery } from "./date-range";
import { buildCtixListIndicatorsAnswer, shouldUseCtixListIndicatorsTemplate } from "./non-technical";

/** Append a plain-language summary block for non-technical users. */
export function appendSimpleExplanation(response: AgentResponse, query: string): string {
  const lines: string[] = [];
  lines.push("\n\n---\n**In simple terms**");

  if (response.mode === "app" && response.app) {
    lines.push(
      `- **What this app does:** ${response.app.description || response.workflow.split("\n")[0]}`
    );
    lines.push(
      "- **What you need:** A developer adds your Cyware login details in a secure settings file (never share these in chat)."
    );
    lines.push(
      "- **What you get:** A web page you can open in the browser to work with Cyware data."
    );
    lines.push(
      "- **What could go wrong:** Missing credentials, wrong product selected, or the API returns no results for your search."
    );
    lines.push(
      "- **To customize:** Tell me changes in plain English — for example “add a filter” or “make the buttons bigger.”"
    );
    return `${response.workflow}${lines.join("\n")}`;
  }

  if (response.steps.length > 0) {
    lines.push(`- **What this does:** ${response.workflow.replace(/^\[[^\]]+\]\s*/, "").split("\n")[0]}`);
    lines.push(
      `- **Steps:** ${response.steps.length} API call${response.steps.length === 1 ? "" : "s"} in order — each step talks to Cyware on your behalf.`
    );
    lines.push(
      "- **What you need:** `<BASE_URL>`, `<ACCESS_ID>`, and a signed token (placeholders in the example code — a developer configures real values)."
    );
    lines.push(
      "- **What you get:** JSON data from Cyware — lists, details, or confirmation that something was created."
    );
    lines.push(
      "- **What could go wrong:** Wrong product (CTIX vs CSAP vs Orchestrate vs CFTR), expired credentials, or missing required fields."
    );
  } else if (response.citations.length > 0) {
    lines.push("- **What this does:** Points you to the right API documentation for your question.");
    lines.push("- **What you need:** Nothing to run live — read the examples with placeholder credentials.");
    lines.push("- **Next step:** Ask me to “build a simple frontend for this” or “show the Python snippet.”");
  } else {
    lines.push("- I could not find an exact match. Try naming the product (CTIX, CSAP, Orchestrate, or CFTR) and what you want to do.");
  }

  if (query.trim()) {
    lines.push(`- **Your request:** “${query.trim().slice(0, 120)}${query.length > 120 ? "…" : ""}”`);
  }

  return `${response.workflow}${lines.join("\n")}`;
}

/**
 * Enrich workflow text for non-technical users or IT handoff.
 * CTIX list-indicators queries get the full A–G template only when essay mode applies.
 */
export function enrichWorkflowWithTemplate(
  response: AgentResponse,
  query: string,
  essayMode = true
): string {
  const productId = response.productContext?.products[0]?.id ?? "ctix";

  if (
    essayMode &&
    response.mode === "workflow" &&
    shouldUseCtixListIndicatorsTemplate(query, productId) &&
    response.steps.length > 0 &&
    !response.workflow.includes("## What you're trying to do")
  ) {
    return buildCtixListIndicatorsAnswer({
      query,
      productId,
      dateRange: parseDateRangeFromQuery(query),
      steps: response.steps,
      scripts: response.scripts,
    });
  }

  if (response.workflow.includes("## What you're trying to do")) {
    return response.workflow;
  }

  if (!essayMode) {
    return response.workflow;
  }

  return appendSimpleExplanation(response, query);
}
