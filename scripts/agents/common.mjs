import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CATALOG = join(ROOT, "catalog");
export const PUBLIC_DATA = join(ROOT, "public", "data");

export const paths = {
  candidates: join(CATALOG, "candidates.json"),
  inbox: join(CATALOG, "inbox.json"),
  reviewQueue: join(CATALOG, "review-queue.json"),
  verified: join(CATALOG, "verified-tools.json"),
  mapped: join(CATALOG, "mapped-tools.json"),
  edited: join(CATALOG, "edited-tools.json"),
  approved: join(CATALOG, "approved-tools.json"),
  report: join(CATALOG, "quality-report.json"),
  status: join(CATALOG, "agent-status.json"),
  history: join(CATALOG, "agent-history.json"),
  publicCatalog: join(PUBLIC_DATA, "software-catalog.json"),
  publicStatus: join(PUBLIC_DATA, "agent-status.json"),
  publicHistory: join(PUBLIC_DATA, "agent-history.json"),
};

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function now() {
  return new Date().toISOString();
}

export function slug(value) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function uniqueStrings(values) {
  return [
    ...new Set(
      values.filter(
        (value) => typeof value === "string" && value.trim().length > 0
      )
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function isRepository(value) {
  return typeof value === "string" && /^[\w.-]+\/[\w.-]+$/.test(value);
}

export async function github(path) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "RoamingEye-catalog-agent",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub ${response.status} for ${path}`);
  }
  return response.json();
}

export function loadCandidates() {
  const seeds = readJson(paths.candidates, { candidates: [] }).candidates;
  const inbox = readJson(paths.inbox, { candidates: [] }).candidates;
  return [...seeds, ...inbox].filter((candidate) =>
    isRepository(candidate?.repository)
  );
}

export function sortTools(tools) {
  return [...tools].sort((a, b) => a.name.localeCompare(b.name));
}
