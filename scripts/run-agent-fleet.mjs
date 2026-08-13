import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format, resolveConfig } from "prettier";
import { runAccessEditor } from "./agents/access-editor.mjs";
import { runExperienceBuilder } from "./agents/experience-builder.mjs";
import { runQaRelease } from "./agents/qa-release.mjs";
import { runScout } from "./agents/scout.mjs";
import { runVerifier } from "./agents/verifier.mjs";
import { runWorkflowMapper } from "./agents/workflow-mapper.mjs";
import { CATALOG, now, paths, readJson, writeJson } from "./agents/common.mjs";

const AGENTS = [
  { id: "scout", label: "Scout", run: runScout },
  { id: "verifier", label: "Verifier", run: runVerifier },
  { id: "workflow-mapper", label: "Workflow Mapper", run: runWorkflowMapper },
  { id: "access-editor", label: "Access Editor", run: runAccessEditor },
  {
    id: "experience-builder",
    label: "Experience Builder",
    run: runExperienceBuilder,
  },
  { id: "qa-release", label: "QA / Release", run: runQaRelease },
];

function numericMetrics(result) {
  return Object.fromEntries(
    Object.entries(result ?? {}).filter(
      ([, value]) => typeof value === "number"
    )
  );
}

function metric(status, agentId, name) {
  return (
    status.agents.find((agent) => agent.id === agentId)?.metrics[name] ?? 0
  );
}

// writeJson emits JSON.stringify layout, but `npm run verify` runs
// `prettier --check` over catalog/ (public/data/ is prettier-ignored) and
// prettier collapses short arrays onto one line. Normalize everything the
// fleet wrote so a run leaves the tree formatter-clean and byte-identical
// to the committed files whenever the content is unchanged.
async function formatCatalog() {
  for (const name of readdirSync(CATALOG)) {
    if (!name.endsWith(".json")) continue;
    const path = join(CATALOG, name);
    const source = readFileSync(path, "utf8");
    const formatted = await format(source, {
      ...(await resolveConfig(path)),
      filepath: path,
    });
    if (formatted !== source) writeFileSync(path, formatted);
  }
}

function persist(status) {
  const history = readJson(paths.history, { version: 1, runs: [] });
  const summary = {
    completedAt: status.completedAt,
    status: status.status,
    discovered: metric(status, "scout", "added"),
    review: metric(status, "verifier", "review"),
    verified: metric(status, "verifier", "verified"),
    published: metric(status, "experience-builder", "published"),
  };
  const runs = [summary, ...history.runs].slice(0, 12);
  const nextHistory = { version: 1, runs };
  writeJson(paths.status, status);
  writeJson(paths.history, nextHistory);
  writeJson(paths.publicStatus, status);
  writeJson(paths.publicHistory, nextHistory);
}

console.log("RoamingEye catalog fleet: starting review-gated run");
const agents = [];
let failure;
for (const agent of AGENTS) {
  const startedAt = now();
  try {
    const result = await agent.run();
    agents.push({
      id: agent.id,
      label: agent.label,
      status: "passed",
      startedAt,
      completedAt: now(),
      metrics: numericMetrics(result),
    });
  } catch (error) {
    failure = error;
    agents.push({
      id: agent.id,
      label: agent.label,
      status: "failed",
      startedAt,
      completedAt: now(),
      metrics: {},
      message: error instanceof Error ? error.message : String(error),
    });
    break;
  }
}

const status = {
  version: 1,
  completedAt: now(),
  status: failure ? "failed" : "passed",
  agents,
};
persist(status);
await formatCatalog();
if (failure) throw failure;
console.log("RoamingEye catalog fleet: complete");
