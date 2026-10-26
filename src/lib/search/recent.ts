import type { RecentSearch } from "../sessionState";
import type { SearchHit, SearchProvider } from "./provider";

/** Empty-field rows for searches this browser has chosen before. */
export function hitsFromRecent(
  entries: readonly RecentSearch[] | undefined
): SearchHit[] {
  if (!entries) return [];
  return entries.map((entry, index) => ({
    id: `recent:${index}:${entry.title}`,
    group: "Recent",
    title: entry.title,
    subtitle: entry.subtitle,
    score: entries.length - index,
    data: entry.action,
  }));
}

export function recentSearchProvider(
  read: () => readonly RecentSearch[] | undefined
): SearchProvider {
  return {
    id: "recent",
    when: "instant",
    suggest() {
      return hitsFromRecent(read());
    },
    search() {
      return [];
    },
  };
}
