import type { SearchHit, SearchProvider } from "./provider";

export interface ResultRow {
  kind: "hit" | "explicit";
  hit?: SearchHit;
  provider?: SearchProvider;
}

export interface HitGroup {
  group: string;
  hits: SearchHit[];
}

/** Group hits in first-seen order. Within a group, higher scores come first. */
export function groupHits(hits: readonly SearchHit[]): HitGroup[] {
  const order: string[] = [];
  const byGroup = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const list = byGroup.get(hit.group);
    if (list) list.push(hit);
    else {
      order.push(hit.group);
      byGroup.set(hit.group, [hit]);
    }
  }
  return order.map((group) => ({
    group,
    hits: byGroup
      .get(group)!
      .slice()
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)),
  }));
}

/**
 * What Enter does.
 *
 * A highlighted row wins. With nothing highlighted, the top instant hit wins
 * — the explicit "Search all places" row is not the top. Enter runs that
 * provider only when the query has no instant hit.
 */
export function enterTarget(
  rows: readonly ResultRow[],
  activeIndex: number
): number | "explicit" | null {
  if (rows.length === 0) return null;
  if (activeIndex >= 0 && activeIndex < rows.length) {
    return rows[activeIndex].kind === "explicit" ? "explicit" : activeIndex;
  }
  const firstHit = rows.findIndex((row) => row.kind === "hit");
  if (firstHit >= 0) return firstHit;
  if (rows.some((row) => row.kind === "explicit")) return "explicit";
  return null;
}

/** Run every provider that offers empty-field rows. */
export async function collectSuggestions(
  providers: readonly SearchProvider[]
): Promise<SearchHit[]> {
  const groups = await Promise.all(
    providers.map((provider) =>
      provider.suggest ? Promise.resolve(provider.suggest()) : []
    )
  );
  return groups.flat();
}

/** Run every instant provider. Explicit providers are skipped. */
export async function collectInstant(
  providers: readonly SearchProvider[],
  query: string
): Promise<SearchHit[]> {
  const instant = providers.filter((provider) => provider.when === "instant");
  const groups = await Promise.all(
    instant.map((provider) => Promise.resolve(provider.search(query)))
  );
  return groups.flat();
}
