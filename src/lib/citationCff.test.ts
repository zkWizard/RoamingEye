import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseCitationCff,
  auditCitationCffConsistency,
  type CitationToolMetadata,
} from "./citationCff";
import { TOOL_CITATION } from "./citation";

/** A minimal, well-formed CFF fixture consistent with the tool metadata below. */
const TOOL: CitationToolMetadata = {
  title: "RoamingEye: an open-data 3D Earth",
  author: "The RoamingEye contributors",
  url: "https://github.com/zkWizard/RoamingEye",
  license: "MIT",
  version: "1.2.3",
};

const CFF = `cff-version: 1.2.0
message: >-
  If you use RoamingEye, please cite it as below.
title: "RoamingEye: an open-data 3D Earth"
type: software
authors:
  - name: "The RoamingEye contributors"
    website: "https://github.com/zkWizard/RoamingEye/graphs/contributors"
repository-code: "https://github.com/zkWizard/RoamingEye"
url: "https://github.com/zkWizard/RoamingEye"
license: MIT
version: 1.2.3
date-released: "2026-07-10"
`;

describe("parseCitationCff", () => {
  it("reads the five cross-published scalar fields", () => {
    expect(parseCitationCff(CFF)).toEqual({
      title: "RoamingEye: an open-data 3D Earth",
      author: "The RoamingEye contributors",
      url: "https://github.com/zkWizard/RoamingEye",
      license: "MIT",
      version: "1.2.3",
    });
  });

  it("takes the first author's name, ignoring nested keys like website", () => {
    const cff = `authors:
  - name: "First Author"
    website: "https://example.org"
  - name: "Second Author"
`;
    expect(parseCitationCff(cff).author).toBe("First Author");
  });

  it("does not read a top-level url past the end of the authors block", () => {
    // The author's `website:` must not be mistaken for the tool `url:`.
    const cff = `authors:
  - name: "Someone"
    website: "https://not-the-tool.example"
license: MIT
`;
    expect(parseCitationCff(cff).url).toBeNull();
  });

  it("reports absent fields as null", () => {
    expect(parseCitationCff("cff-version: 1.2.0\n")).toEqual({
      title: null,
      author: null,
      url: null,
      license: null,
      version: null,
    });
  });

  it("unquotes single- and double-quoted scalars and trims bare ones", () => {
    const cff = `title: 'Single Quoted'
license:   MIT
version: "9.9.9"
`;
    const parsed = parseCitationCff(cff);
    expect(parsed.title).toBe("Single Quoted");
    expect(parsed.license).toBe("MIT");
    expect(parsed.version).toBe("9.9.9");
  });
});

describe("auditCitationCffConsistency", () => {
  it("passes when every field matches the tool metadata", () => {
    const audit = auditCitationCffConsistency(CFF, TOOL);
    expect(audit.issues).toEqual([]);
    expect(audit.consistent).toBe(true);
  });

  it("flags a mismatched field, in field order, with both values", () => {
    const drifted = CFF.replace("version: 1.2.3", "version: 1.2.4");
    const audit = auditCitationCffConsistency(drifted, TOOL);
    expect(audit.consistent).toBe(false);
    expect(audit.issues).toHaveLength(1);
    expect(audit.issues[0]).toMatchObject({
      field: "version",
      code: "mismatch",
      cffValue: "1.2.4",
      toolValue: "1.2.3",
    });
  });

  it("flags a field the CFF drops entirely as missing-in-cff", () => {
    const withoutLicense = CFF.replace("license: MIT\n", "");
    const audit = auditCitationCffConsistency(withoutLicense, TOOL);
    expect(audit.issues.map((i) => [i.field, i.code])).toEqual([
      ["license", "missing-in-cff"],
    ]);
  });

  it("reports issues in stable field order when several drift at once", () => {
    const audit = auditCitationCffConsistency("cff-version: 1.2.0\n", TOOL);
    expect(audit.issues.map((i) => i.field)).toEqual([
      "title",
      "author",
      "url",
      "license",
      "version",
    ]);
    expect(audit.issues.every((i) => i.code === "missing-in-cff")).toBe(true);
  });
});

describe("committed CITATION.cff", () => {
  const cff = readFileSync(
    new URL("../../CITATION.cff", import.meta.url),
    "utf8"
  );

  it("stays in step with TOOL_CITATION (drift guard)", () => {
    const audit = auditCitationCffConsistency(cff);
    // Surface every mismatched field if this ever fails, not just a bare false.
    expect(audit.issues, JSON.stringify(audit.issues, null, 2)).toEqual([]);
    expect(audit.consistent).toBe(true);
  });

  it("matches the app version the exporters cite", () => {
    // TOOL_CITATION.version is the build-injected package version; the CFF must
    // track it so a release bump updates both citation sources together.
    expect(parseCitationCff(cff).version).toBe(String(TOOL_CITATION.version));
  });
});
