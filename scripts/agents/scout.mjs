import {
  github,
  loadCandidates,
  now,
  paths,
  readJson,
  writeJson,
} from "./common.mjs";

const QUERIES = [
  "topic:geospatial stars:>=50 archived:false",
  "topic:remote-sensing stars:>=20 archived:false",
  "topic:climate-science stars:>=20 archived:false",
];

/**
 * Finds candidates only. Discovery never publishes a record; people approve
 * candidates in catalog/candidates.json after the verifier has gathered proof.
 */
export async function runScout() {
  if (process.env.AGENT_OFFLINE === "1") {
    console.log("scout: offline mode, discovery skipped");
    return { added: 0 };
  }
  const known = new Set(
    loadCandidates().map((candidate) => candidate.repository)
  );
  const inbox = readJson(paths.inbox, { version: 1, candidates: [] });
  const discovered = [];

  for (const query of QUERIES) {
    try {
      const result = await github(
        `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`
      );
      for (const repository of result.items ?? []) {
        if (known.has(repository.full_name)) continue;
        known.add(repository.full_name);
        discovered.push({
          repository: repository.full_name,
          approval: "pending",
          discoveredAt: now(),
          discoveredBy: "scout",
          discoveryQuery: query,
        });
      }
    } catch (error) {
      console.warn(`scout: ${error.message}`);
    }
  }

  inbox.candidates = [...inbox.candidates, ...discovered].sort((a, b) =>
    a.repository.localeCompare(b.repository)
  );
  writeJson(paths.inbox, inbox);
  console.log(
    `scout: added ${discovered.length} candidates to the review inbox`
  );
  return { added: discovered.length };
}
