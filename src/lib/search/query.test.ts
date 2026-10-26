import { describe, expect, it } from "vitest";
import type { SearchHit, SearchProvider } from "./provider";
import { enterTarget, groupHits } from "./query";

function hit(group: string, title: string, score: number): SearchHit {
  return {
    id: `${group}:${title}`,
    group,
    title,
    score,
    data: { type: "story", storyId: title },
  };
}

const explicit: SearchProvider = {
  id: "nominatim",
  when: "explicit",
  label: () => "Search all places",
  search: () => [],
};

describe("groupHits", () => {
  it("keeps first-seen group order and sorts a group by score", () => {
    const groups = groupHits([
      hit("Cities", "Quito", 800),
      hit("Stories", "Sahel", 400),
      hit("Cities", "Iquitos", 1000),
    ]);
    expect(groups.map((group) => group.group)).toEqual(["Cities", "Stories"]);
    expect(groups[0].hits.map((item) => item.title)).toEqual([
      "Iquitos",
      "Quito",
    ]);
  });
});

describe("enterTarget", () => {
  const rows = [
    { kind: "hit" as const, hit: hit("Cities", "Quito", 1000) },
    { kind: "explicit" as const, provider: explicit },
  ];

  it("takes the highlighted row, and the top instant hit when nothing is highlighted", () => {
    expect(enterTarget(rows, 0)).toBe(0);
    expect(enterTarget(rows, 1)).toBe("explicit");
    expect(enterTarget(rows, -1)).toBe(0);
  });

  it("runs the explicit provider only when the query has no instant hit", () => {
    const world = [{ kind: "explicit" as const, provider: explicit }];
    expect(enterTarget(world, -1)).toBe("explicit");
    expect(enterTarget([], -1)).toBeNull();
  });
});
