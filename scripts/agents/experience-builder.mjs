import { now, paths, readJson, sortTools, writeJson } from "./common.mjs";

/** Compiles approved editorial records into the static catalog the browser reads. */
export async function runExperienceBuilder() {
  const edited = readJson(paths.edited, { tools: [] }).tools;
  const catalog = {
    version: 1,
    generatedAt: now(),
    tools: sortTools(edited),
  };
  writeJson(paths.approved, catalog);
  writeJson(paths.publicCatalog, catalog);
  console.log(
    `experience-builder: published ${catalog.tools.length} approved records`
  );
  return { published: catalog.tools.length };
}
