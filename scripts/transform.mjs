// Shared text-transform helpers for ingestion + local cleaning.

/** Single-pass HTML entity decode (named + numeric). */
export function decodeEntities(input) {
  if (!input) return "";
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    "#39": "'",
  };
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(code)) return String.fromCodePoint(code);
      return m;
    }
    const key = body.toLowerCase();
    return key in named ? named[key] : m;
  });
}

/** Extract inner text of the single <pre> block of an exported page. */
export function extractPre(html) {
  const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!m) return "";
  return decodeEntities(m[1]);
}

/** Convert <CodeBlock>..<CodeLine>..</CodeLine>..</CodeBlock> into fenced code. */
export function convertCodeBlocks(md) {
  return md.replace(
    /<CodeBlock\b([^>]*)>([\s\S]*?)<\/CodeBlock>/g,
    (full, attrsRaw, inner) => {
      let lang = "text";
      const attrMatch = attrsRaw.match(/attributes\s*=\s*'([\s\S]*?)'/);
      if (attrMatch) {
        try {
          const attrs = JSON.parse(attrMatch[1]);
          if (attrs.lang) lang = String(attrs.lang).toLowerCase();
        } catch {
          /* ignore malformed attribute json */
        }
      }
      const lines = [];
      const lineRe = /<CodeLine>([\s\S]*?)<\/CodeLine>/g;
      let lm;
      while ((lm = lineRe.exec(inner)) !== null) {
        lines.push(decodeEntities(lm[1]));
      }
      const code = lines.join("\n").replace(/\s+$/g, "");
      return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }
  );
}

/** Convert <Callout ...>..<p>..</p>..</Callout> into a markdown blockquote. */
export function convertCallouts(md) {
  return md.replace(/<Callout\b[^>]*>([\s\S]*?)<\/Callout>/g, (full, inner) => {
    const text = inner
      .replace(/<\/p>\s*<p>/g, "\n")
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      .trim();
    if (!text) return "";
    const quoted = text
      .split("\n")
      .map((l) => `> ${l.trim()}`)
      .join("\n");
    return `\n\n> [!NOTE]\n${quoted}\n\n`;
  });
}

/** Strip residual inline HTML tags (e.g. <span style=...>) but keep text. */
export function stripInlineHtml(md) {
  const parts = md.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => (part.startsWith("```") ? part : part.replace(/<\/?[a-zA-Z][^>]*>/g, "")))
    .join("");
}

/** Remove Theneo export glitches and fix broken techdocs link suffixes. */
export function fixMarkdownArtifacts(md) {
  if (!md) return "";
  return md
    // Leaked HTML/script tail from upstream export (e.g. `\"}'>` on overview page).
    .replace(/\\?"\}'>\s*/g, "")
    // Techdocs links often end with `.html##)` or `?foo=bar##)` instead of `)`.
    .replace(/(\]\([^)]+?)##\)/g, "$1)")
    .replace(/(\]\([^)]+?)##(?=\))/g, "$1")
    // Collapse excessive blank lines left after artifact removal.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Normalize prose: code blocks -> fences, callouts -> blockquotes, drop html. */
export function cleanProse(text) {
  if (!text) return "";
  return fixMarkdownArtifacts(
    stripInlineHtml(convertCallouts(convertCodeBlocks(text)))
  ).trim();
}
