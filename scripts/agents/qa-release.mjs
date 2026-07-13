import { pathToFileURL } from "node:url";
import { paths, readJson, writeJson } from "./common.mjs";

function validateTool(tool) {
  const errors = [];
  for (const field of [
    "id",
    "name",
    "summary",
    "repository",
    "documentation",
    "license",
    "verifiedAt",
  ]) {
    if (typeof tool[field] !== "string" || tool[field].trim() === "") {
      errors.push(`missing ${field}`);
    }
  }
  if (!tool.repository?.startsWith("https://github.com/")) {
    errors.push("repository must be an HTTPS GitHub URL");
  }
  if (!tool.documentation?.startsWith("https://")) {
    errors.push("documentation must be an HTTPS URL");
  }
  if (!tool.license || tool.license === "NOASSERTION") {
    errors.push("missing SPDX license evidence");
  }
  for (const field of [
    "domains",
    "workflows",
    "formats",
    "platforms",
    "access",
    "accessNotes",
    "languages",
  ]) {
    if (!Array.isArray(tool[field]) || tool[field].length === 0) {
      errors.push(`missing ${field}`);
    }
  }
  if (!tool.evidence?.repositoryApi?.startsWith("https://api.github.com/")) {
    errors.push("missing GitHub API evidence");
  }
  return errors;
}

/** Final gate: validates the exact static JSON served to the public site. */
export async function runQaRelease() {
  const catalog = readJson(paths.publicCatalog, null);
  const errors = [];
  if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.tools)) {
    errors.push({ id: "catalog", errors: ["invalid catalog envelope"] });
  } else {
    const ids = new Set();
    for (const tool of catalog.tools) {
      const toolErrors = validateTool(tool);
      if (ids.has(tool.id)) toolErrors.push("duplicate id");
      ids.add(tool.id);
      if (toolErrors.length > 0)
        errors.push({ id: tool.id, errors: toolErrors });
    }
  }
  const report = {
    version: 1,
    checkedAt: new Date().toISOString(),
    tools: catalog?.tools?.length ?? 0,
    passed: errors.length === 0,
    errors,
  };
  writeJson(paths.report, report);
  if (!report.passed) {
    throw new Error(`catalog QA failed for ${errors.length} records`);
  }
  console.log(`qa-release: ${report.tools} records passed publication checks`);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runQaRelease();
}
