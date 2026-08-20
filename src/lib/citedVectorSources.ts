import { SEISMICITY_SOURCE } from "./earthquakes";
import { NATURAL_EARTH_SOURCE } from "./naturalEarthSource";
import { BIRD_2003_PLATE_BOUNDARY_SOURCE } from "./plateBoundaryContext";
import { GVP_VOLCANO_SOURCE } from "./volcanoContext";

/**
 * Citations for the vector datasets the globe renders alongside the GIBS
 * imagery: Smithsonian GVP volcanoes, USGS seismicity, the Bird (2003)
 * plate-boundary model, and the Natural Earth basemap behind the borders,
 * regions and cities.
 *
 * `citedDatasets()` (providers.ts) enumerates only the layers backed by a CMR
 * `DatasetRef` — a NASA product with a short name, a product version, and a
 * product DOI. The four sources below are rendered just as prominently — on the
 * globe itself, plus place-panel and hover readouts — and two of them carry a
 * real DOI, but none is a CMR product: forcing them into a `DatasetRef` would invent a
 * short name and a version no archive publishes. They are modelled separately
 * here instead, and the citation bundle emits both groups.
 *
 * Every field is transcribed from the provenance constant that already travels
 * with each dataset. Nothing is re-derived and no identifier is invented: a
 * source without a DOI is cited by its landing URL and says so, rather than
 * borrowing an unrelated one. Where the repo holds a publisher-supplied
 * reference string, the structured fields are transcriptions of it and
 * `formattedCitation` keeps the original for cross-checking (see the
 * transcription test, which asserts each part still occurs in the verbatim
 * string).
 *
 * These entries are static facts, so the bundle stays byte-stable: no access
 * date is stamped. A continuously updated feed instead carries a `note` telling
 * the reader to add the date they retrieved it, which is the one piece of
 * provenance only they can supply.
 */

export interface VectorSourceCitation {
  /** Stable ASCII key, shared by the BibTeX entry and the CSL item's `id`. */
  key: string;
  /** Work title, as its publisher names it. */
  title: string;
  /**
   * Publishing organisation. Omitted for a work whose committed provenance
   * names only a journal — `containerTitle` carries that, and naming a
   * publisher the repo never recorded would be an invented fact.
   */
  publisher?: string;
  /**
   * CSL item type. The volcano database is cited as data; Bird (2003) is cited
   * as the journal article that defines the model, because the DOI this repo
   * holds resolves to that article and not to a data product.
   */
  type: "dataset" | "article-journal";
  /** Database or edition version, when the publisher issues one. */
  version?: string;
  /** DOI without the resolver prefix. Absent for a source that has none. */
  doi?: string;
  /** Citable landing page — the only locator for a source with no DOI. */
  url: string;
  /** The app surfaces this source powers, for the "Citing the data" list. */
  usedBy: string[];
  /** Author, as the publisher-supplied reference string spells it. */
  author?: string;
  /** Publication year of the cited work. */
  year?: number;
  /** Journal or database the work appeared in (CSL `container-title`). */
  containerTitle?: string;
  volume?: string;
  issue?: string;
  /** The publisher-supplied reference string, verbatim, when the repo holds one. */
  formattedCitation?: string;
  /** What a reader needs to know to cite this source honestly. */
  note?: string;
}

/**
 * The rendered vector sources, in the order the overlays are introduced on the
 * providers page. Built fresh on each call so a caller cannot mutate the shared
 * provenance constants through a returned array.
 */
export function citedVectorSources(): VectorSourceCitation[] {
  return [
    {
      key: "dataset_GVPVolcanoesOfTheWorld",
      title: GVP_VOLCANO_SOURCE.name,
      publisher: GVP_VOLCANO_SOURCE.org,
      type: "dataset",
      version: GVP_VOLCANO_SOURCE.databaseVersion,
      doi: GVP_VOLCANO_SOURCE.doi,
      url: GVP_VOLCANO_SOURCE.url,
      usedBy: ["Volcanoes overlay", "Volcano records"],
      // The bundled extract's own data date, not today's database state: the
      // overlay ships a snapshot prepared by scripts/prepare-data.mjs.
      note: `Bundled extract dated ${GVP_VOLCANO_SOURCE.dataDate}; the live database moves on.`,
    },
    {
      key: "dataset_USGSSeismicityFeed",
      title: SEISMICITY_SOURCE.name,
      publisher: "U.S. Geological Survey",
      type: "dataset",
      url: SEISMICITY_SOURCE.url,
      usedBy: ["Earthquakes overlay", "Nearby seismicity"],
      // No DOI and no fixed version exist for this feed, so none is emitted.
      // The retrieval date is the reader's to supply; the app cannot stamp one
      // without making the exported bundle non-deterministic.
      note:
        "Continuously updated feed: it carries no DOI and no fixed version, " +
        "so cite it with the date you retrieved the events.",
    },
    {
      key: "article_Bird2003PlateBoundaries",
      title: "An updated digital model of plate boundaries",
      type: "article-journal",
      doi: BIRD_2003_PLATE_BOUNDARY_SOURCE.doi,
      url: BIRD_2003_PLATE_BOUNDARY_SOURCE.url,
      usedBy: ["Plate boundaries overlay", "Plate-pair boundary labels"],
      author: "Bird, P.",
      year: 2003,
      containerTitle: "Geochemistry, Geophysics, Geosystems",
      volume: "4",
      issue: "3",
      formattedCitation: BIRD_2003_PLATE_BOUNDARY_SOURCE.citation,
      // What the globe draws is a community digitization of Bird's model, not
      // the author's original supplementary file; crediting only the article
      // would hide where the rendered geometry actually came from.
      note: `Rendered from the ${BIRD_2003_PLATE_BOUNDARY_SOURCE.digitization} (${BIRD_2003_PLATE_BOUNDARY_SOURCE.digitizationUrl}).`,
    },
    {
      key: "dataset_NaturalEarthVector",
      title: NATURAL_EARTH_SOURCE.name,
      publisher: NATURAL_EARTH_SOURCE.org,
      type: "dataset",
      url: NATURAL_EARTH_SOURCE.url,
      usedBy: ["Borders overlay", "Cities overlay", "Place and region names"],
      // Natural Earth issues numbered releases, but prepare-data.mjs fetches an
      // unpinned branch of the mirror, so this repo does not know which one the
      // shipped extract came from. No version is emitted rather than a guessed
      // one; the theme files are named instead, because those the repo does
      // record and they are what makes the extract reproducible.
      note:
        `Public-domain basemap, cited without a version: the bundled extract ` +
        `was taken from ${NATURAL_EARTH_SOURCE.mirrorUrl} at an unpinned ` +
        `branch (${NATURAL_EARTH_SOURCE.themes.join(", ")}).`,
    },
  ];
}
