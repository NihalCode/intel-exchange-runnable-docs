/** Parse casual date-range phrases for agent answers and code generation. */

export interface ParsedDateRange {
  /** Original phrase matched, e.g. "last 7 days". */
  phrase: string;
  /** Approximate day count when known. */
  days?: number;
  /** Plain-English explanation for non-technical users. */
  guidance: string;
  /** CQL fragment for CTIX threat-data list (uses placeholders). */
  cqlFilter: string;
  startPlaceholder: string;
  endPlaceholder: string;
  /** Short comment for generated code. */
  codeComment: string;
}

const RANGE_PATTERNS: { pattern: RegExp; days?: number; phrase: string }[] = [
  { pattern: /\blast\s+24\s+hours?\b/i, days: 1, phrase: "last 24 hours" },
  { pattern: /\byesterday\b/i, days: 1, phrase: "yesterday" },
  { pattern: /\blast\s+(\d+)\s+days?\b/i, phrase: "last N days" },
  { pattern: /\bpast\s+(\d+)\s+days?\b/i, phrase: "past N days" },
  { pattern: /\blast\s+week\b/i, days: 7, phrase: "last week" },
  { pattern: /\bthis\s+week\b/i, days: 7, phrase: "this week" },
  { pattern: /\blast\s+month\b/i, days: 30, phrase: "last month" },
  { pattern: /\bthis\s+month\b/i, days: 30, phrase: "this month" },
];

export function parseDateRangeFromQuery(query: string): ParsedDateRange | null {
  const q = query.toLowerCase();

  for (const rule of RANGE_PATTERNS) {
    const m = q.match(rule.pattern);
    if (!m) continue;

    let days = rule.days;
    let phrase = rule.phrase;
    if (m[1] && /^\d+$/.test(m[1])) {
      days = Number(m[1]);
      phrase = `last ${days} days`;
    }

    const guidance =
      days != null
        ? `Your IT team can set the start time to **now minus ${days} day${days === 1 ? "" : "s"}** and the end time to **now**. The example code calculates these timestamps automatically — you do not need to look up "epoch time" yourself.`
        : `Your IT team can pick a start date and end date. The example code can calculate the timestamps automatically from those dates.`;

    return {
      phrase,
      days,
      guidance,
      cqlFilter: ` AND ctix_created >= <START_TIME> AND ctix_created <= <END_TIME>`,
      startPlaceholder: "<START_TIME>",
      endPlaceholder: "<END_TIME>",
      codeComment: days
        ? `// Last ${days} days — calculated automatically at run time`
        : "// Date range — calculated automatically at run time",
    };
  }

  return null;
}

export function hasDateRangePhrase(query: string): boolean {
  return parseDateRangeFromQuery(query) !== null;
}

/** JavaScript snippet lines that compute epoch seconds for a rolling window. */
export function jsEpochRangeSnippet(days: number): string {
  return [
    "const endSec = Math.floor(Date.now() / 1000);",
    `const startSec = endSec - ${days} * 24 * 60 * 60;`,
  ].join("\n");
}

/** Python snippet lines for epoch range. */
export function pythonEpochRangeSnippet(days: number): string {
  return [
    "import time",
    "end_sec = int(time.time())",
    `start_sec = end_sec - ${days} * 24 * 60 * 60`,
  ].join("\n");
}

/** cURL-oriented comment block (placeholders stay in URL/body). */
export function curlDateRangeComment(days: number): string {
  return (
    `# Date filter: last ${days} days — replace <START_TIME> and <END_TIME> with Unix seconds,\n` +
    `# or ask your IT team to run the JavaScript/Python example which calculates them automatically.`
  );
}
