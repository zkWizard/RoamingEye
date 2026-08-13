/**
 * The NASA archive that *publishes* each dataset RoamingEye cites.
 *
 * Every dataset citation this app emits — BibTeX, RIS, CSL-JSON, and the
 * formatted-text form — named "NASA Global Imagery Browse Services (GIBS)" as
 * the publisher of every product. That is the wrong organisation. GIBS is the
 * imagery *service* the app streams pictures from; it neither archives these
 * products nor issued their DOIs. Each DOI belongs to a NASA Distributed Active
 * Archive Center (DAAC), and NASA's data-citation guidance (and the ESIP data
 * citation guidelines the providers page already follows) puts the archive in
 * the publisher/distributor slot. A reader who pasted our BibTeX into a
 * manuscript published a bibliography crediting the wrong body — a provenance
 * defect that survives into print, where it cannot be corrected.
 *
 * GIBS is not dropped: it keeps the credit it actually asks for, verbatim, in
 * `GIBS_ACKNOWLEDGMENT` (providers.ts), which the providers page renders
 * directly beneath this list. Service acknowledgment and dataset publisher are
 * two different statements, and conflating them is what this module ends.
 *
 * Entries are keyed by DOI because that is how the app already deduplicates
 * citations (`citedDatasets`, `briefCitationBundle`), and because the DOI — not
 * the short name — is what the archive registered. Each mapping below was read
 * off the landing page the DOI actually resolves to, not inferred from the
 * product family: the four MODIS products here sit in *three* different DAACs
 * (vegetation, land-surface temperature and land cover at LP DAAC; snow cover at
 * NSIDC; sea-surface temperature at PO.DAAC), so "it's MODIS" predicts nothing.
 *
 * Names are the archives' own full forms, since a citation's publisher field is
 * read by people and reference managers that will not expand an initialism.
 */

/** One NASA archive, as a data citation must name it. */
export interface DatasetArchive {
  /** Full archive name, for the publisher field of a citation. */
  name: string;
  /** The archive's own short form, for space-constrained inline use. */
  abbreviation: string;
  /** The archive's landing page. */
  url: string;
}

const LP_DAAC: DatasetArchive = {
  name: "NASA Land Processes Distributed Active Archive Center (LP DAAC)",
  abbreviation: "LP DAAC",
  url: "https://lpdaac.usgs.gov/",
};

const GES_DISC: DatasetArchive = {
  name: "NASA Goddard Earth Sciences Data and Information Services Center (GES DISC)",
  abbreviation: "GES DISC",
  url: "https://disc.gsfc.nasa.gov/",
};

const PO_DAAC: DatasetArchive = {
  name: "NASA Physical Oceanography Distributed Active Archive Center (PO.DAAC)",
  abbreviation: "PO.DAAC",
  url: "https://podaac.jpl.nasa.gov/",
};

const NSIDC_DAAC: DatasetArchive = {
  name: "NASA National Snow and Ice Data Center Distributed Active Archive Center (NSIDC DAAC)",
  abbreviation: "NSIDC DAAC",
  url: "https://nsidc.org/data/",
};

/**
 * DOI → publishing archive, verified 2026-08-13 by resolving each DOI and
 * reading the archive its landing page belongs to. The comment on each line
 * records the host that resolution landed on, so a future re-check compares
 * against what was actually observed rather than against a guess.
 */
const ARCHIVE_BY_DOI: Readonly<Record<string, DatasetArchive>> = {
  "10.5067/MODIS/MOD13A3.061": LP_DAAC, // earthdata catalog: lpcloud-mod13a3-061
  "10.5067/MODIS/MOD11C3.061": LP_DAAC, // earthdata catalog: lpcloud-mod11c3-061
  "10.5067/MODIS/MCD12Q1.061": LP_DAAC, // earthdata catalog: lpcloud-mcd12q1-061
  "10.5067/ASTER/ASTGTM.003": LP_DAAC, // earthdata catalog: lpcloud-astgtm-003
  "10.5067/HLS/HLSS30.002": LP_DAAC, // earthdata catalog: lpcloud-hlss30-2.0
  "10.5067/AP1B0BA5PD2K": GES_DISC, // disc.gsfc.nasa.gov: M2TMNXSLV_5.12.4
  "10.5067/FH9A0MLJPC7N": GES_DISC, // disc.gsfc.nasa.gov: M2TMNXAER_5.12.4
  "10.5067/SXAVCZFAQLNO": GES_DISC, // disc.gsfc.nasa.gov: GLDAS_NOAH025_M_2.1
  "10.5067/MODSA-MO9D9": PO_DAAC, // earthdata catalog: pocloud-modis-aqua-l3-sst-…
  "10.5067/MODIS/MOD10CM.061": NSIDC_DAAC, // nsidc.org/data/MOD10CM/versions/61
};

/**
 * The archive that publishes the dataset with this DOI, or undefined when the
 * repo has not verified one.
 *
 * Undefined is deliberately a *silence*, not a fallback: callers omit the
 * publisher rather than substituting a plausible one. Guessing an archive from
 * a DOI prefix would reintroduce exactly the defect this module exists to fix —
 * every product here shares the 10.5067 prefix while sitting in four different
 * archives. `archiveCoverageGaps` keeps the silence from going unnoticed.
 */
export function datasetArchive(doi: string): DatasetArchive | undefined {
  return ARCHIVE_BY_DOI[doi];
}

/**
 * Which of the given DOIs have no verified archive, in the order supplied.
 * Empty when every one is covered.
 *
 * A new layer arrives with a DatasetRef but no entry here, and its citations
 * would quietly lose their publisher. Handing this the app's cited DOIs turns
 * that into a test failure the layer's author sees, rather than a missing line
 * a reader never notices. The DOIs are passed in rather than read from the
 * catalog so this registry stays a leaf: it is imported by the citation
 * formatters, which several bundles already pull in.
 */
export function archiveCoverageGaps(dois: readonly string[]): string[] {
  return dois.filter((doi) => datasetArchive(doi) === undefined);
}
