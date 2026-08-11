import { describe, expect, it } from "vitest";
import {
  ATMOSPHERE_LAYER_IDS,
  atmosphereClaimRules,
  auditAtmosphereCaption,
  auditAtmosphereCaptions,
  formatAtmosphereCaptionFinding,
} from "./atmosphereLayerClaims";
import { LAYERS } from "./timeline";

describe("atmosphereLayerClaims", () => {
  it("passes every caption the app actually ships", () => {
    const findings = auditAtmosphereCaptions();
    expect(findings.map(formatAtmosphereCaptionFinding)).toEqual([]);
  });

  it("covers exactly the layers whose field is atmospheric", () => {
    // Guards against a new atmosphere layer landing unaudited: every layer
    // GIBS-categorized "Atmosphere" must be in the audited set. `airtemp` is
    // categorized Temperature and `precip` Water, so the reverse does not hold.
    const categorized = Object.values(LAYERS)
      .filter((layer) => layer.category === "Atmosphere")
      .map((layer) => layer.id);
    for (const id of categorized) {
      expect(ATMOSPHERE_LAYER_IDS).toContain(id);
    }
  });

  it("rejects the surface air-quality claim the aerosol caption used to make", () => {
    // The exact string shipped before this module existed.
    const findings = auditAtmosphereCaption(
      "aerosol",
      "Aerosol optical thickness — dust, smoke, and air quality."
    );

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      layerId: "aerosol",
      kind: "unsupported-claim",
      phrase: "air quality",
      claim: "surface air quality",
    });
    expect(findings[0].reason).toContain("whole-column optical thickness");
    // The same caption also named no production method, so a reader had no
    // way to learn the field is modelled rather than measured.
    expect(findings[1]).toMatchObject({
      kind: "unstated-production-method",
      phrase: null,
    });
  });

  it("accepts a caption that drops the claim and names the reanalysis", () => {
    expect(
      auditAtmosphereCaption(
        "aerosol",
        "Aerosol optical thickness — dust, smoke (MERRA-2 reanalysis)."
      )
    ).toEqual([]);
  });

  it("still flags a column caption that names the model but keeps the claim", () => {
    const findings = auditAtmosphereCaption(
      "aerosol",
      "Column AOD and air-quality proxy (MERRA-2 reanalysis)."
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "unsupported-claim",
      phrase: "air-quality",
    });
  });

  it("flags forecast language on any atmosphere layer", () => {
    for (const layerId of ATMOSPHERE_LAYER_IDS) {
      const findings = auditAtmosphereCaption(
        layerId,
        `${LAYERS[layerId].description} Forecast included.`
      );
      expect(
        findings.filter((finding) => finding.claim === "future conditions")
      ).toHaveLength(1);
    }
  });

  it("flags a direct-measurement claim on a modelled field", () => {
    const findings = auditAtmosphereCaption(
      "airtemp",
      "Near-surface air temperature, directly measured (MERRA-2 reanalysis)."
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "unsupported-claim",
      claim: "direct measurement",
      phrase: "directly measured",
    });
  });

  it("flags an accumulated depth on the precipitation rate layer", () => {
    const findings = auditAtmosphereCaption(
      "precip",
      "Monthly total rainfall (GLDAS land model)."
    );

    expect(
      findings.filter((finding) => finding.claim === "accumulated depth")
    ).toHaveLength(1);
    expect(findings[0].reason).toContain("length of the month");
  });

  it("reports a missing production method on its own", () => {
    const findings = auditAtmosphereCaption(
      "precip",
      "Total precipitation rate."
    );

    expect(findings).toEqual([
      {
        layerId: "precip",
        kind: "unstated-production-method",
        phrase: null,
        claim: "production method",
        reason: expect.stringContaining("reads as a measurement"),
      },
    ]);
  });

  it("matches phrases case-insensitively", () => {
    const findings = auditAtmosphereCaption(
      "aerosol",
      "AIR QUALITY index (MERRA-2 Reanalysis)."
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].phrase).toBe("air quality");
  });

  it("gives every layer the shared rules plus its own", () => {
    expect(atmosphereClaimRules("airtemp").map((rule) => rule.claim)).toEqual([
      "future conditions",
      "direct measurement",
    ]);
    expect(atmosphereClaimRules("aerosol").map((rule) => rule.claim)).toEqual([
      "future conditions",
      "direct measurement",
      "surface air quality",
    ]);
  });

  it("carries a citable reason on every finding", () => {
    // A finding a maintainer cannot act on is a nuisance; each must say why
    // the field cannot support the claim, not merely that it is banned.
    for (const layerId of ATMOSPHERE_LAYER_IDS) {
      for (const rule of atmosphereClaimRules(layerId)) {
        expect(rule.reason.length).toBeGreaterThan(40);
        expect(rule.phrases.length).toBeGreaterThan(0);
        for (const phrase of rule.phrases) {
          expect(phrase).toBe(phrase.toLowerCase());
        }
      }
    }
  });

  it("formats a finding as an actionable line", () => {
    const [finding] = auditAtmosphereCaption(
      "aerosol",
      "Smog index (MERRA-2 reanalysis)."
    );

    expect(formatAtmosphereCaptionFinding(finding)).toContain(
      'aerosol: unsupported-claim — surface air quality ("smog")'
    );
  });
});
