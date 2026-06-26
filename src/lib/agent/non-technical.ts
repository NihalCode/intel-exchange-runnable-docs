import type { AgentPlan, AgentStepResult, WorkflowScript } from "./types";
import { parseDateRangeFromQuery, type ParsedDateRange } from "./date-range";
import { getProductOrThrow } from "../products/registry";

/** User signals they want plain-English, step-by-step guidance. */
export function isNonTechnicalQuery(query: string): boolean {
  return (
    /\b(i'?m|i am)\s+not\s+technical\b/i.test(query) ||
    /\bplain\s+english\b/i.test(query) ||
    /\bstep\s*[- ]by\s*[- ]step\b/i.test(query) ||
    /\blayman\b/i.test(query) ||
    /\bnon[- ]?technical\b/i.test(query) ||
    /\bexplain\s+(simply|like i|in plain|for (a )?non-?technical)\b/i.test(query) ||
    /\blike i am not a developer\b/i.test(query) ||
    /\blike i'm not a developer\b/i.test(query) ||
    /\bhelp me understand\b/i.test(query) ||
    /\bin simple terms\b/i.test(query)
  );
}

/** User wants handoff-ready code for IT/API team. */
export function isHandoffQuery(query: string): boolean {
  return (
    isNonTechnicalQuery(query) ||
    /\b(it team|api team|my team|developer|dev team)\b/i.test(query) ||
    /\bhand\s*off\b/i.test(query) ||
    /\bgive (me )?(example )?code\b/i.test(query)
  );
}

const IRRELEVANT_QUESTION =
  /\b(epoch|unix time|report\s*id|recipient|email address|file_id|token to download|e-?mail)\b/i;

const EPOCH_QUESTION = /\b(epoch|unix\s*(time|timestamp)|provide.*timestamp)\b/i;

/** Drop generic or irrelevant clarifying questions for non-technical users. */
export function filterClarifyingQuestions(
  questions: string[] | undefined,
  query: string,
  endpointSlug?: string
): string[] | undefined {
  if (!questions?.length) return undefined;

  const isReportEndpoint = endpointSlug?.includes("report") ?? false;
  const dateRange = parseDateRangeFromQuery(query);

  let filtered = questions.filter((q) => {
    const lower = q.toLowerCase();
    if (IRRELEVANT_QUESTION.test(lower) && !isReportEndpoint) return false;
    if (dateRange && EPOCH_QUESTION.test(lower)) return false;
    if (/\bwhat product\b/i.test(lower) && /\b(ctix|csap|cftr|orchestrate)\b/i.test(query)) {
      return false;
    }
    return true;
  });

  filtered = filtered.slice(0, 3);
  return filtered.length > 0 ? filtered : undefined;
}

export interface CtixListIndicatorsAnswerOpts {
  query: string;
  productId: string;
  dateRange: ParsedDateRange | null;
  steps: AgentStepResult[];
  scripts?: WorkflowScript[];
}

/** Full non-technical answer template (sections A–G) for CTIX threat indicator listing. */
export function buildCtixListIndicatorsAnswer(opts: CtixListIndicatorsAnswerOpts): string {
  const product = getProductOrThrow(opts.productId);
  const dateRange = opts.dateRange ?? parseDateRangeFromQuery(opts.query);
  const days = dateRange?.days ?? 7;
  const datePhrase = dateRange?.phrase ?? "a recent time window";

  const cqlBase = 'type = "indicator"';
  const cqlWithDate = dateRange
    ? `${cqlBase}${dateRange.cqlFilter}`
    : `${cqlBase} /* optional: add ctix_created date filter */`;

  const curlExample = buildHandoffCurl(cqlWithDate, days);
  const jsExample = buildHandoffJavaScript(cqlWithDate, days);

  const lines: string[] = [];

  lines.push("## What you're trying to do");
  lines.push(
    `You want to **see threat indicators** (things like suspicious IPs, domains, and URLs) in **${product.displayLabel}** ` +
      `that were added or updated in **${datePhrase}**. Indicators are the individual pieces of threat intelligence your organization tracks in CTIX.`
  );

  lines.push("\n## Use this endpoint");
  lines.push(
    "**Get Threat Data List** — `POST <BASE_URL>/ingestion/threat-data/list/`  \n" +
      "This is CTIX's main **search** endpoint for threat data. You send a filter in the request body (called a **CQL query**) that tells CTIX what to return — for example, only records whose type is **indicator**."
  );

  lines.push("\n## Ask your IT / API team for");
  lines.push("- **Base URL** — your company's CTIX address ending in `/ctixapi` (example placeholder: `<BASE_URL>`)");
  lines.push("- **Access ID and Secret Key** — from Cyware Admin → Open API (your admin generates these)");
  lines.push("- **Signature and Expires** — your IT team calculates these automatically from the Secret Key when running the request");
  if (dateRange) {
    lines.push(
      `- **Date range** — **${datePhrase}** (the code below calculates start/end times automatically; you do **not** need to provide epoch timestamps yourself)`
    );
  }
  lines.push("- **Page size** — how many results per page (start with `100`; use `page` for additional pages if there are more results)");

  lines.push("\n## Step-by-step");
  lines.push("1. **Product:** Use **CTIX / Intel Exchange** (Intel Exchange is the same product).");
  lines.push("2. **Endpoint:** `POST ingestion/threat-data/list/` — search threat data with a filter.");
  lines.push(
    `3. **Filter:** Use a CQL query like \`${cqlBase}\`${dateRange ? ` plus a **created date** filter for ${datePhrase}` : ""}.`
  );
  lines.push("4. **Query params:** Set `page_size` (e.g. `100`) and `page` (`1` for the first page). Sort defaults to newest first (`-ctix_created`).");
  lines.push("5. **Run:** Send the request with Open API auth on the URL (`AccessID`, `Signature`, `Expires`).");
  lines.push("6. **Read the response:** Look for a list of threat data objects — each item has an `id`, `type`, `value`, `ctix_created`, and related metadata.");

  lines.push("\n## Example code for your IT team");
  lines.push("### Example cURL for your IT team");
  lines.push("```bash");
  lines.push(curlExample);
  lines.push("```");

  lines.push("\n### JavaScript version");
  lines.push("```javascript");
  lines.push(jsExample);
  lines.push("```");

  if (opts.scripts?.length) {
    const py = opts.scripts.find((s) => s.language === "python");
    if (py) {
      lines.push("\n### Python version");
      lines.push("```python");
      lines.push(py.code.slice(0, 1200) + (py.code.length > 1200 ? "\n# …" : ""));
      lines.push("```");
    }
  }

  lines.push("\n## What the result means");
  lines.push(
    "A successful response returns a **JSON list of threat indicators**. Each row is one indicator your organization has in CTIX. " +
      "If the list is empty, either nothing matched your date filter or there were no indicators in that window — try a wider date range or check with your admin."
  );

  lines.push("\n## Common mistakes");
  lines.push("- **Missing or expired credentials** — regenerate Signature & Expires if you get 401/403.");
  lines.push("- **Wrong base URL** — must be your tenant's `/ctixapi`, not the public documentation website.");
  lines.push("- **Date filter too narrow** — widen the range if you get zero results.");
  lines.push("- **Forgetting pagination** — if there are many indicators, increase `page` to fetch the next batch.");
  lines.push("- **Confusing this with report downloads or email** — listing indicators uses threat-data list, not report file endpoints.");

  lines.push("\n## Next steps");
  lines.push("- Ask me to **generate the Python version** if you need it.");
  lines.push("- Ask me to **turn this into a small dashboard** your team can open in a browser.");
  lines.push("- Ask me to **add a filter** (for example, only IP addresses or only high-risk scores).");

  if (dateRange) {
    lines.push("\n---");
    lines.push(`**About dates:** ${dateRange.guidance}`);
  }

  lines.push(
    "\n---\n*Live testing in the docs requires your organization's API credentials. I can still show you the endpoint, settings, and example code without them.*"
  );

  return lines.join("\n");
}

function buildHandoffCurl(cqlQuery: string, days: number): string {
  const body = JSON.stringify({ query: cqlQuery.replace(/<START_TIME>/g, "<START_TIME>").replace(/<END_TIME>/g, "<END_TIME>") }, null, 2);
  return (
    `# ${days}-day window — IT team replaces placeholders\n` +
    `curl -X POST "<BASE_URL>/ingestion/threat-data/list/?AccessID=<ACCESS_ID>&Signature=<SIGNATURE>&Expires=<EXPIRES>&page_size=100&page=1&sort=-ctix_created" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '${body.replace(/'/g, "'\\''")}'`
  );
}

function buildHandoffJavaScript(cqlQuery: string, days: number): string {
  return `// ${days}-day indicator list — placeholders only
const endSec = Math.floor(Date.now() / 1000);
const startSec = endSec - ${days} * 24 * 60 * 60;
const cql = \`${cqlQuery.replace("<START_TIME>", "${startSec}").replace("<END_TIME>", "${endSec}")}\`;

const url = new URL("<BASE_URL>/ingestion/threat-data/list/");
url.searchParams.set("AccessID", "<ACCESS_ID>");
url.searchParams.set("Signature", "<SIGNATURE>");
url.searchParams.set("Expires", "<EXPIRES>");
url.searchParams.set("page_size", "100");
url.searchParams.set("page", "1");
url.searchParams.set("sort", "-ctix_created");

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: cql }),
});
const data = await res.json();
console.log(data);`;
}

/** Wrap an existing plan workflow with the non-technical template when we have CTIX list-indicators intent. */
export function shouldUseCtixListIndicatorsTemplate(query: string, productId: string): boolean {
  if (productId !== "ctix") return false;
  const q = query.toLowerCase();
  const wantsIndicators = /\bindicators?\b|threat\s*data|\biocs?\b/.test(q);
  const wantsList = /\blist\b|\bget\b|\bshow\b|\bsee\b|\bfetch\b|\bfind\b/.test(q);
  const notTag = !/\btags?\b/.test(q) || /\bindicators?\b/.test(q);
  const notCreate = !/\bcreate\b|\bimport\b|\bupload\b/.test(q);
  return wantsIndicators && wantsList && notTag && notCreate;
}

export function buildProductContextLabel(
  products: { id: string; label: string }[],
  source: "query" | "dropdown"
): string {
  if (products.length === 0) return "";
  const names = products.map((p) => p.label).join(", ");
  if (source === "query") return `Using: ${names}, based on your question`;
  return `Using: ${names} from the selected product dropdown`;
}

/** Default simple mode: non-technical phrasing or no technical jargon requested. */
export function defaultSimpleMode(query: string): boolean {
  return isNonTechnicalQuery(query) || isHandoffQuery(query);
}

export function softenDocsModeNote(): string {
  return (
    "I can show you the endpoint, settings, and example code without live credentials. " +
    "Live API testing in the documentation requires your organization's developer credentials."
  );
}
