import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildProbeCsv, csvHeaderText, PROBE_SCALES } from "./probe";
import type { YearMonth } from "./timeline";

/**
 * RFC 4180 discipline for the probe CSV, proven against a strict parser.
 *
 * The export's contract (see csvHeaderText in probe.ts): every `#` header
 * line is a single delimiter-free CSV field — except `# view_url`, whose
 * commas are valid URI characters — and every data row is purely
 * `YYYY-MM` + fixed-decimal numbers. A parser that knows nothing about our
 * comment convention must still tokenize the file without mangling a
 * single provenance field, no matter what upstream layer labels or dataset
 * titles contain.
 */

/** Minimal strict RFC 4180 tokenizer (quote-aware, CRLF/LF tolerant). */
function parseRfc4180(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (quoted) throw new Error("unterminated quote");
  return rows;
}

const months: YearMonth[] = [
  { year: 2000, month: 3 },
  { year: 2000, month: 4 },
];

const baseMeta = {
  layerLabel: "Vegetation (NDVI)",
  wmsLayer: "MODIS_Terra_L3_NDVI_Monthly",
  lat: -3.4653,
  lon: -62.2159,
  scale: PROBE_SCALES.ndvi,
  mode: "point" as const,
  imageWidth: 1024,
  imageHeight: 512,
  generatedIso: "2026-07-03T12:00:00Z",
};

describe("csvHeaderText", () => {
  it("scrubs delimiters, quotes, and line breaks; keeps everything else", () => {
    expect(csvHeaderText('a,b "c"\r\nd\ne')).toBe("a;b 'c' d e");
    expect(csvHeaderText("Vegetation (NDVI)")).toBe("Vegetation (NDVI)");
  });

  it("never emits a character that could split or requote a field", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        const safe = csvHeaderText(s);
        expect(safe).not.toMatch(/[,"\r\n]/);
      })
    );
  });
});

describe("probe CSV under a strict RFC 4180 parser", () => {
  it("parses today's real export: one field per header line, exact data grid", () => {
    const csv = buildProbeCsv(
      {
        ...baseMeta,
        dataset: {
          shortName: "MOD13A3",
          version: "061",
          doi: "10.5067/MODIS/MOD13A3.061",
          title: "MODIS/Terra Vegetation Indices Monthly L3 Global 1km",
        },
        mode: "region" as const,
        sampledBounds: { south: -18, west: 178, north: -14, east: 182 },
        toolVersion: "1.1.0",
      },
      months,
      [0.8123, null],
      undefined,
      [0.87, 0]
    );
    const rows = parseRfc4180(csv.trimEnd());
    const headerRows = rows.filter((r) => r[0].startsWith("#"));
    const dataRows = rows.filter((r) => !r[0].startsWith("#"));
    // Every provenance line survives as a single untorn field.
    for (const r of headerRows) {
      expect(r, `header split into cells: ${JSON.stringify(r)}`).toHaveLength(
        1
      );
    }
    // Column header + one row per month, all with the same field count.
    expect(dataRows[0]).toEqual([
      "year_month",
      "value",
      "anomaly",
      "valid_fraction",
    ]);
    for (const r of dataRows.slice(1)) expect(r).toHaveLength(4);
    // Numbers round-trip: every non-empty cell is a finite number.
    for (const r of dataRows.slice(1)) {
      expect(r[0]).toMatch(/^\d{4}-\d{2}$/);
      for (const cell of r.slice(1)) {
        if (cell !== "") expect(Number.isFinite(Number(cell))).toBe(true);
      }
    }
  });

  it("stays parseable for ADVERSARIAL layer labels and dataset titles", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 80 }),
        fc.string({ maxLength: 120 }),
        (label, title) => {
          const csv = buildProbeCsv(
            {
              ...baseMeta,
              layerLabel: label,
              dataset: {
                shortName: "X",
                version: "1",
                doi: "10.0/x",
                title,
              },
            },
            months,
            [0.5, null]
          );
          const rows = parseRfc4180(csv.trimEnd());
          for (const r of rows) {
            if (r[0].startsWith("#")) {
              // Provenance is never torn into ragged cells...
              expect(r).toHaveLength(1);
            } else {
              // ...and adversarial text can never masquerade as data.
              expect(r.length === 3 || r.length === 4).toBe(true);
            }
          }
        }
      )
    );
  });

  it("view_url is the documented exception: byte-exact even with commas", () => {
    const url =
      "https://zkwizard.github.io/RoamingEye/#layer=ndvi&t=2026-05&probe=-3.4653,-62.2159";
    const csv = buildProbeCsv({ ...baseMeta, viewUrl: url }, months, [
      0.5,
      null,
    ]);
    expect(csv).toContain(`# view_url: ${url}`);
  });
});
