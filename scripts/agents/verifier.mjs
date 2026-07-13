import {
  github,
  loadCandidates,
  paths,
  readJson,
  slug,
  sortTools,
  today,
  uniqueStrings,
  writeJson,
} from "./common.mjs";

function safeHomepage(value) {
  return typeof value === "string" && value.startsWith("https://")
    ? value
    : undefined;
}

function recordFrom(candidate, repository) {
  const license = repository.license?.spdx_id;
  if (!license || license === "NOASSERTION") return null;
  if (repository.archived || !repository.html_url || !repository.updated_at) {
    return null;
  }
  return {
    id: slug(repository.full_name),
    name: repository.name,
    summary:
      repository.description ??
      `${repository.name} is an open-source Earth science software project.`,
    repository: repository.html_url,
    ...(safeHomepage(repository.homepage)
      ? { homepage: safeHomepage(repository.homepage) }
      : {}),
    documentation: candidate.documentation ?? `${repository.html_url}#readme`,
    license,
    domains: uniqueStrings(candidate.domains ?? []),
    workflows: uniqueStrings(candidate.workflows ?? []),
    formats: uniqueStrings(candidate.formats ?? []),
    platforms: uniqueStrings(candidate.platforms ?? []),
    access: uniqueStrings(candidate.access ?? []),
    languages: uniqueStrings(candidate.languages ?? ["English"]),
    verifiedAt: today(),
    evidence: {
      repositoryApi: repository.url,
      repositoryUpdatedAt: repository.updated_at,
    },
    signals: uniqueStrings([
      repository.description ?? "",
      ...(repository.topics ?? []),
    ]),
  };
}

/** Verify repository identity, availability, and SPDX license evidence. */
export async function runVerifier() {
  const previous = readJson(paths.verified, { tools: [] }).tools;
  const previousByRepository = new Map(
    previous.map((tool) => [tool.repository.toLocaleLowerCase(), tool])
  );
  const approved = [];
  const review = [];

  for (const candidate of loadCandidates()) {
    try {
      if (process.env.AGENT_OFFLINE === "1") throw new Error("offline mode");
      const repository = await github(`/repos/${candidate.repository}`);
      const record = recordFrom(candidate, repository);
      const status = record ? "verified" : "needs-evidence";
      review.push({
        repository: candidate.repository,
        approval: candidate.approval ?? "pending",
        status,
        checkedAt: new Date().toISOString(),
        license: repository.license?.spdx_id ?? null,
        archived: Boolean(repository.archived),
        evidence: repository.url,
      });
      if (record && candidate.approval === "approved") approved.push(record);
    } catch (error) {
      const cached = previousByRepository.get(
        `https://github.com/${candidate.repository}`.toLocaleLowerCase()
      );
      if (candidate.approval === "approved" && cached) approved.push(cached);
      review.push({
        repository: candidate.repository,
        approval: candidate.approval ?? "pending",
        status: "unavailable",
        checkedAt: new Date().toISOString(),
        error: error.message,
      });
    }
  }

  const deduped = new Map(approved.map((tool) => [tool.id, tool]));
  writeJson(paths.verified, {
    version: 1,
    tools: sortTools([...deduped.values()]),
  });
  writeJson(paths.reviewQueue, { version: 1, candidates: review });
  console.log(`verifier: ${deduped.size} approved records verified`);
  return { verified: deduped.size, review: review.length };
}
