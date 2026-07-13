export interface SoftwareTool {
  id: string;
  name: string;
  summary: string;
  repository: string;
  homepage?: string;
  documentation: string;
  license: string;
  domains: string[];
  workflows: string[];
  formats: string[];
  platforms: string[];
  access: string[];
  accessNotes: string[];
  languages: string[];
  verifiedAt: string;
  evidence: {
    repositoryApi: string;
    repositoryUpdatedAt: string;
  };
}

export interface SoftwareCatalog {
  version: 1;
  generatedAt: string;
  tools: SoftwareTool[];
}

export interface SoftwareFilters {
  query?: string;
  domain?: string;
  platform?: string;
  access?: string;
}

const stringFields = [
  "id",
  "name",
  "summary",
  "repository",
  "documentation",
  "license",
  "verifiedAt",
] as const;

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function hasString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasHttpsUrl(value: unknown): value is string {
  return hasString(value) && value.startsWith("https://");
}

function isTool(value: unknown): value is SoftwareTool {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (!stringFields.every((field) => hasString(candidate[field]))) return false;
  if (
    !hasHttpsUrl(candidate.repository) ||
    !hasHttpsUrl(candidate.documentation)
  ) {
    return false;
  }
  if (candidate.homepage !== undefined && !hasHttpsUrl(candidate.homepage)) {
    return false;
  }
  if (
    ![
      "domains",
      "workflows",
      "formats",
      "platforms",
      "access",
      "accessNotes",
      "languages",
    ].every((field) => isStringArray(candidate[field]))
  ) {
    return false;
  }
  const evidence = candidate.evidence;
  return (
    !!evidence &&
    typeof evidence === "object" &&
    hasHttpsUrl((evidence as Record<string, unknown>).repositoryApi) &&
    hasString((evidence as Record<string, unknown>).repositoryUpdatedAt)
  );
}

/** Validate the static catalog before it reaches the public finder. */
export function parseSoftwareCatalog(value: unknown): SoftwareCatalog {
  if (!value || typeof value !== "object") {
    throw new Error("Software catalog must be an object");
  }
  const catalog = value as Record<string, unknown>;
  if (catalog.version !== 1 || !hasString(catalog.generatedAt)) {
    throw new Error("Software catalog has an unsupported version or timestamp");
  }
  if (!Array.isArray(catalog.tools) || !catalog.tools.every(isTool)) {
    throw new Error("Software catalog contains an invalid tool record");
  }
  const ids = catalog.tools.map((tool) => tool.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Software catalog contains duplicate tool ids");
  }
  return catalog as unknown as SoftwareCatalog;
}

function matchesQuery(tool: SoftwareTool, query: string): boolean {
  const haystack = [
    tool.name,
    tool.summary,
    tool.license,
    ...tool.domains,
    ...tool.workflows,
    ...tool.formats,
    ...tool.platforms,
    ...tool.access,
    ...tool.accessNotes,
    ...tool.languages,
  ]
    .join(" ")
    .toLocaleLowerCase();
  return query
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function includesFacet(
  values: string[],
  expected: string | undefined
): boolean {
  return !expected || values.includes(expected);
}

/** Return approved tools matching the user's explicit, explainable filters. */
export function filterSoftware(
  tools: SoftwareTool[],
  filters: SoftwareFilters = {}
): SoftwareTool[] {
  return tools.filter(
    (tool) =>
      (!filters.query || matchesQuery(tool, filters.query)) &&
      includesFacet(tool.domains, filters.domain) &&
      includesFacet(tool.platforms, filters.platform) &&
      includesFacet(tool.access, filters.access)
  );
}

/** Stable facet values keep the finder controls reproducible and easy to scan. */
export function catalogFacets(
  tools: SoftwareTool[],
  field: "domains" | "platforms" | "access"
): string[] {
  return [...new Set(tools.flatMap((tool) => tool[field]))].sort((a, b) =>
    a.localeCompare(b)
  );
}
