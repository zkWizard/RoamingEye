import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseVolcanoDataset } from "./volcanoes";
import {
  CRUSTAL_THICKNESS_CLASSES,
  TECTONIC_SETTING_CLASSES,
  parseVolcanoTectonicSetting,
  tectonicSettingLabel,
} from "./volcanoTectonicSetting";

describe("parseVolcanoTectonicSetting", () => {
  it("reads both halves of a compound GVP label", () => {
    expect(
      parseVolcanoTectonicSetting(
        "Subduction zone / Continental crust (> 25 km)"
      )
    ).toEqual({
      raw: "Subduction zone / Continental crust (> 25 km)",
      setting: "subduction-zone",
      settingText: "Subduction zone",
      crust: "continental",
      crustText: "Continental crust (> 25 km)",
      crustalThicknessBandKm: { minKm: 25, maxKm: null },
    });
  });

  it("reproduces the printed bounds of each crustal-thickness class", () => {
    const band = (label: string) =>
      parseVolcanoTectonicSetting(label).crustalThicknessBandKm;
    expect(band("Rift zone / Oceanic crust (< 15 km)")).toEqual({
      minKm: null,
      maxKm: 15,
    });
    expect(band("Intraplate / Intermediate crust (15-25 km)")).toEqual({
      minKm: 15,
      maxKm: 25,
    });
    expect(band("Intraplate / Continental crust (> 25 km)")).toEqual({
      minKm: 25,
      maxKm: null,
    });
  });

  it("keeps GVP's own unknown thickness distinct from an absent label", () => {
    const unknown = parseVolcanoTectonicSetting(
      "Subduction zone / Crustal thickness unknown"
    );
    expect(unknown.crust).toBe("unknown");
    expect(unknown.crustText).toBe("Crustal thickness unknown");
    // GVP said "unknown"; it did not print a band, so none is invented.
    expect(unknown.crustalThicknessBandKm).toBeNull();

    const absent = parseVolcanoTectonicSetting(null);
    expect(absent).toEqual({
      raw: null,
      setting: "not-supplied",
      settingText: null,
      crust: "not-supplied",
      crustText: null,
      crustalThicknessBandKm: null,
    });
    expect(parseVolcanoTectonicSetting("   ")).toEqual(absent);
    expect(parseVolcanoTectonicSetting(undefined)).toEqual(absent);
  });

  it("tolerates spacing and case variation without guessing", () => {
    const parsed = parseVolcanoTectonicSetting(
      "  RIFT  ZONE /oceanic crust (< 15 km)  "
    );
    expect(parsed.setting).toBe("rift-zone");
    expect(parsed.crust).toBe("oceanic");
    // Normalization is for matching only; the source text stays verbatim.
    expect(parsed.settingText).toBe("RIFT  ZONE");
    expect(parsed.raw).toBe("  RIFT  ZONE /oceanic crust (< 15 km)  ");
  });

  it("flags vocabulary outside the closed set instead of folding it in", () => {
    const parsed = parseVolcanoTectonicSetting(
      "Hotspot chain / Transitional crust (8-12 km)"
    );
    expect(parsed.setting).toBe("unrecognized");
    expect(parsed.crust).toBe("unrecognized");
    expect(parsed.crustalThicknessBandKm).toBeNull();
    // Nothing GVP said is discarded, so a refresh can be diagnosed.
    expect(parsed.settingText).toBe("Hotspot chain");
    expect(parsed.crustText).toBe("Transitional crust (8-12 km)");
  });

  it("does not truncate a label carrying more than one separator", () => {
    const parsed = parseVolcanoTectonicSetting("Rift zone / Oceanic / Extra");
    expect(parsed.setting).toBe("rift-zone");
    expect(parsed.crust).toBe("unrecognized");
    expect(parsed.crustText).toBe("Oceanic / Extra");
  });

  it("treats a label with no separator as an unreadable crust half", () => {
    const parsed = parseVolcanoTectonicSetting("Subduction zone");
    expect(parsed.setting).toBe("subduction-zone");
    expect(parsed.settingText).toBe("Subduction zone");
    expect(parsed.crust).toBe("unrecognized");
    expect(parsed.crustText).toBeNull();
  });
});

describe("tectonicSettingLabel", () => {
  it("phrases both halves without restating the printed bounds", () => {
    expect(
      tectonicSettingLabel(
        parseVolcanoTectonicSetting("Subduction zone / Oceanic crust (< 15 km)")
      )
    ).toBe("subduction zone, oceanic crust");
    expect(
      tectonicSettingLabel(
        parseVolcanoTectonicSetting(
          "Subduction zone / Crustal thickness unknown"
        )
      )
    ).toBe("subduction zone, crustal thickness unknown");
  });

  it("falls back to verbatim source text rather than hiding it", () => {
    expect(
      tectonicSettingLabel(
        parseVolcanoTectonicSetting("Hotspot chain / Transitional crust")
      )
    ).toBe("Hotspot chain, Transitional crust");
    expect(
      tectonicSettingLabel(parseVolcanoTectonicSetting("Subduction zone"))
    ).toBe("subduction zone");
  });

  it("says so when the catalog recorded no setting", () => {
    expect(tectonicSettingLabel(parseVolcanoTectonicSetting(null))).toBe(
      "tectonic setting not recorded"
    );
  });
});

/**
 * Vocabulary guard against the file the app actually ships. A GVP refresh that
 * introduces a new setting or thickness class would otherwise reach users as a
 * silent "unrecognized" in the marker tooltip; here it fails the build.
 */
describe("the bundled GVP catalog", () => {
  const dataset = parseVolcanoDataset(
    JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "public", "data", "volcanoes.json"),
        "utf8"
      )
    )
  );

  it("maps every record into the closed vocabulary", () => {
    expect(dataset.volcanoes.length).toBeGreaterThanOrEqual(1000);
    const unreadable: string[] = [];
    const settings = new Set<string>();
    const crusts = new Set<string>();

    for (const volcano of dataset.volcanoes) {
      const parsed = parseVolcanoTectonicSetting(
        volcano.sourceRecord?.tectonicSetting
      );
      settings.add(parsed.setting);
      crusts.add(parsed.crust);
      if (
        parsed.setting === "unrecognized" ||
        parsed.crust === "unrecognized"
      ) {
        unreadable.push(`${volcano.name}: ${parsed.raw}`);
      }
    }

    expect(unreadable).toEqual([]);
    for (const setting of settings) {
      expect(TECTONIC_SETTING_CLASSES).toContain(setting);
    }
    for (const crust of crusts) {
      expect(CRUSTAL_THICKNESS_CLASSES).toContain(crust);
    }
    // All three GVP settings are present, so the mapping is exercised rather
    // than passing because one class happens to dominate the snapshot.
    expect(settings).toContain("subduction-zone");
    expect(settings).toContain("rift-zone");
    expect(settings).toContain("intraplate");
  });

  it("supplies a setting for the overwhelming majority of records", () => {
    const supplied = dataset.volcanoes.filter(
      (volcano) =>
        parseVolcanoTectonicSetting(volcano.sourceRecord?.tectonicSetting)
          .setting !== "not-supplied"
    ).length;
    // 1190 of 1196 in the 2026-05 snapshot; a collapse means a bad slimming
    // run dropped the field rather than GVP withdrawing it.
    expect(supplied / dataset.volcanoes.length).toBeGreaterThan(0.95);
  });
});
