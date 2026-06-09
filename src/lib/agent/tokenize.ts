const STOP = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "for", "on", "with", "is", "are",
  "be", "by", "at", "from", "as", "it", "this", "that", "i", "my", "me", "we", "you",
  "how", "what", "when", "where", "which", "can", "do", "does", "get", "use", "using",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_/+-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function termFrequencies(tokens: string[]): Record<string, number> {
  const terms: Record<string, number> = {};
  for (const t of tokens) {
    terms[t] = (terms[t] ?? 0) + 1;
  }
  return terms;
}
