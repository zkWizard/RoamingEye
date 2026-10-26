/** Case- and accent-folded text, for matching "Sao" to "São Paulo". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * How well `label` matches `query`, or null when it doesn't.
 * Exact beats prefix, prefix beats a word start, a word start beats a
 * substring. Callers add their own small boost (population) on top.
 */
export function matchScore(query: string, label: string): number | null {
  const q = fold(query).trim();
  const name = fold(label);
  if (q.length < 2 || !name.includes(q)) return null;
  if (name === q) return 1000;
  if (name.startsWith(q)) return 800;
  const words = name.split(/[^a-z0-9]+/);
  if (words.some((word) => word.startsWith(q))) return 600;
  return 400;
}
