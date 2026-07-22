/** Extract ## / ### headings from markdown for a lightweight TOC. */
export function extractMarkdownHeadings(
  markdown: string
): Array<{ id: string; text: string; level: number }> {
  const out: Array<{ id: string; text: string; level: number }> = [];
  for (const line of markdown.split("\n")) {
    const m = /^(#{2,3})\s+(.+)$/.exec(line.trim());
    if (!m) continue;
    const text = m[2].replace(/[#*`[\]]/g, "").trim();
    if (!text) continue;
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    out.push({ id, text, level: m[1].length });
  }
  return out;
}
