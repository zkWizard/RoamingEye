import {
  paths,
  readJson,
  sortTools,
  uniqueStrings,
  writeJson,
} from "./common.mjs";

const MAPPINGS = [
  {
    match: /seism|waveform|earthquake/i,
    domain: "Seismology",
    workflow: "Waveform analysis",
  },
  {
    match: /climate|meteorolog|weather|atmospher/i,
    domain: "Climate",
    workflow: "Multidimensional analysis",
  },
  {
    match: /raster|satellite|remote.sensing|photogrammetr/i,
    domain: "Remote sensing",
    workflow: "Raster processing",
  },
  {
    match: /geospatial|geographic|vector|cartograph/i,
    domain: "GIS",
    workflow: "Vector analysis",
  },
];

function mapTool(tool) {
  const text = [tool.name, tool.summary, ...(tool.signals ?? [])].join(" ");
  const domains = [...tool.domains];
  const workflows = [...tool.workflows];
  for (const mapping of MAPPINGS) {
    if (!mapping.match.test(text)) continue;
    domains.push(mapping.domain);
    workflows.push(mapping.workflow);
  }
  const record = { ...tool };
  delete record.signals;
  return {
    ...record,
    domains: uniqueStrings(domains),
    workflows: uniqueStrings(workflows),
  };
}

/** Adds explainable scientific workflow tags without generating prose claims. */
export async function runWorkflowMapper() {
  const verified = readJson(paths.verified, { tools: [] }).tools;
  const tools = sortTools(verified.map(mapTool));
  writeJson(paths.mapped, { version: 1, tools });
  console.log(`workflow-mapper: mapped ${tools.length} approved records`);
  return { mapped: tools.length };
}
