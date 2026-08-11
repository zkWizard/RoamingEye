/**
 * The freezing point of seawater, and what it says about the one open cap at
 * the cold end of NASA GIBS's published SST colormap.
 *
 * GIBS's MODIS_Sea_Surface_Temperature colormap resolves 0.00–32.00 °C in 213
 * finite bins and then closes each end with a single open cap entry:
 * `[-INF,0.00)` at the cold end and `[32.00,+INF)` at the warm end. The finite
 * bins are the only entries the probe can invert: a cap carries no `lo - hi`
 * tooltip range, so it is dropped when the colormap is parsed. A pixel painted
 * with a cap colour therefore does not fail to decode: it is matched to the
 * nearest surviving bin and reported as that bin's midpoint. Detecting that
 * collapse is handled elsewhere; this module supplies the marine-science fact
 * that the collapse discards, which is that the two caps are not symmetric.
 *
 * The warm cap is genuinely open: nothing in the ocean forbids a skin
 * temperature above 32 °C. The cold cap is not. Liquid seawater cannot be
 * colder than its freezing point, so `< 0.00 °C` is a CLOSED interval roughly
 * two degrees wide, not an unbounded one, and a reader who is told only "below
 * zero" is being given less than the source supports.
 *
 * The honesty limits are explicit and never dropped:
 * - The closed lower bound holds only for OPEN SEAWATER. Where the surface is
 *   sea ice, a thermal-infrared retrieval measures the ice skin, which is a
 *   different surface and can sit tens of degrees below the freezing point of
 *   the water beneath it. This app cannot tell open water from ice by reading
 *   the rendered imagery, so the bound is reported with its assumption
 *   attached rather than asserted.
 * - The freezing point depends on salinity, which this app does not observe.
 *   The bound is therefore taken at the saltiest plausible open-ocean surface
 *   salinity, which is the coldest (widest, most conservative) case.
 * - Nothing here is a biological, ecological, sea-ice-extent, or forecast
 *   claim. A temperature at the freezing point says nothing about whether ice
 *   is present, nor about any organism.
 */

/**
 * UNESCO's equation for the freezing point of seawater at the surface, as a
 * function of practical salinity. Cited rather than DOI-linked: the algorithm
 * is published as a numbered technical paper, not as a DOI-registered dataset.
 */
export const SEAWATER_FREEZING_POINT_METHOD = {
  kind: "published-algorithm",
  title:
    "Algorithms for computation of fundamental properties of seawater: freezing point of seawater",
  authority: "UNESCO",
  series: "UNESCO Technical Papers in Marine Science",
  number: 44,
  year: 1983,
  /** The equation is due to Millero, carried forward by the UNESCO paper. */
  originalAuthor: "Millero (1978)",
} as const;

/**
 * Practical-salinity range over which the UNESCO equation is defined. Values
 * outside it are refused rather than extrapolated.
 */
export const SEAWATER_FREEZING_POINT_SALINITY_DOMAIN = {
  minPsu: 4,
  maxPsu: 40,
} as const;

/**
 * Surface practical salinity spanned by the open ocean. The lower end covers
 * the freshened polar surface layers where sub-zero SST actually occurs; the
 * upper end covers the saltiest open-ocean surface water. Marginal seas
 * (Baltic, Black Sea) and brine pools sit outside this range and are not
 * represented by it.
 */
export const OPEN_OCEAN_SURFACE_SALINITY = {
  minPsu: 30,
  maxPsu: 37,
} as const;

/**
 * The cold cap as GIBS writes it, recorded so a colormap change fails a test
 * instead of silently invalidating the bound below.
 */
export const SUB_ZERO_SST_CAP = {
  colormapDoc: "MODIS_Sea_Surface_Temperature",
  sourceValue: "[-INF,0.00)",
  rgb: { r: 43, g: 0, b: 26 },
  /** The cap's upper edge: the coldest value the finite bins can express. */
  upperEdgeC: 0,
} as const;

export interface SeawaterFreezingPointResult {
  kind: "seawater-freezing-point";
  salinityPsu: number;
  /** Freezing point at the surface, in °C. */
  freezingPointC: number;
  method: typeof SEAWATER_FREEZING_POINT_METHOD;
}

/**
 * Freezing point of seawater at the surface (0 dbar) for a practical salinity,
 * in °C. Returns null for a salinity outside the equation's published domain,
 * so a caller never receives an extrapolated value that looks measured.
 */
export function seawaterFreezingPointC(salinityPsu: number): number | null {
  if (!Number.isFinite(salinityPsu)) return null;
  if (
    salinityPsu < SEAWATER_FREEZING_POINT_SALINITY_DOMAIN.minPsu ||
    salinityPsu > SEAWATER_FREEZING_POINT_SALINITY_DOMAIN.maxPsu
  ) {
    return null;
  }
  return (
    -0.0575 * salinityPsu +
    1.710523e-3 * Math.pow(salinityPsu, 1.5) -
    2.154996e-4 * salinityPsu * salinityPsu
  );
}

/** Freezing point with its citation attached, or null outside the domain. */
export function describeSeawaterFreezingPoint(
  salinityPsu: number
): SeawaterFreezingPointResult | null {
  const freezingPointC = seawaterFreezingPointC(salinityPsu);
  if (freezingPointC === null) return null;
  return {
    kind: "seawater-freezing-point",
    salinityPsu,
    freezingPointC,
    method: SEAWATER_FREEZING_POINT_METHOD,
  };
}

export interface SubZeroSstCapBound {
  kind: "sub-zero-sst-cap-bound";
  /** Coldest liquid seawater across {@link OPEN_OCEAN_SURFACE_SALINITY}, °C. */
  lowerC: number;
  /** Exclusive upper edge of the cap, °C. */
  upperC: number;
  /** Width of the closed interval the cap represents, °C. */
  widthC: number;
  /** Salinity at which the lower bound is taken (the coldest, widest case). */
  boundSalinityPsu: number;
  /** The bound is only this tight if the pixel is open water, not sea ice. */
  assumption: "open-seawater";
  method: typeof SEAWATER_FREEZING_POINT_METHOD;
  cap: typeof SUB_ZERO_SST_CAP;
}

/**
 * The closed interval GIBS's `< 0.00 °C` cap stands for, under the stated
 * open-water assumption. The lower edge is taken at the saltiest open-ocean
 * surface salinity because that is the coldest freezing point, and so the
 * widest — a bound that errs toward claiming less.
 */
export function subZeroSstCapBound(): SubZeroSstCapBound {
  const boundSalinityPsu = OPEN_OCEAN_SURFACE_SALINITY.maxPsu;
  // Non-null by construction: the open-ocean range sits inside the domain,
  // which the test suite pins.
  const lowerC = seawaterFreezingPointC(boundSalinityPsu) as number;
  const upperC = SUB_ZERO_SST_CAP.upperEdgeC;
  return {
    kind: "sub-zero-sst-cap-bound",
    lowerC,
    upperC,
    widthC: upperC - lowerC,
    boundSalinityPsu,
    assumption: "open-seawater",
    method: SEAWATER_FREEZING_POINT_METHOD,
    cap: SUB_ZERO_SST_CAP,
  };
}

export interface SubZeroSstCapBias {
  kind: "sub-zero-sst-cap-bias";
  /** The value the nearest-entry inversion actually reported, °C. */
  decodedC: number;
  bound: SubZeroSstCapBound;
  /**
   * The collapse can only overstate the temperature, so the error has a known
   * sign. Both magnitudes are in °C and are bounds, not estimates.
   */
  direction: "warm";
  /** Smallest possible overstatement (true value is just under the cap edge). */
  minWarmBiasC: number;
  /** Largest possible overstatement (true value at the freezing point). */
  maxWarmBiasC: number;
}

/**
 * Bound the error a cold-cap collapse introduces, given the value the
 * inversion reported for it. Taking the decoded value as an argument keeps
 * this module independent of how a caller detects the collapse.
 *
 * Returns null when the reported value is not above the cap's upper edge: in
 * that case the value did not come from the cold cap being read as warmer than
 * it is, and inventing a bias for it would be a fabricated correction.
 */
export function subZeroSstCapBias(decodedC: number): SubZeroSstCapBias | null {
  if (!Number.isFinite(decodedC)) return null;
  const bound = subZeroSstCapBound();
  if (decodedC <= bound.upperC) return null;
  return {
    kind: "sub-zero-sst-cap-bias",
    decodedC,
    bound,
    direction: "warm",
    minWarmBiasC: decodedC - bound.upperC,
    maxWarmBiasC: decodedC - bound.lowerC,
  };
}

/**
 * Limits that must travel with any use of the bound. Stated without numbers so
 * a reader cannot mistake a caveat for a correction that has been applied.
 */
export const SUB_ZERO_SST_CAP_LIMITATIONS: readonly string[] = [
  "The lower bound assumes the pixel is open seawater; over sea ice a thermal-infrared retrieval measures the ice skin, which can be far colder than the freezing point of the water beneath it.",
  "Salinity is not observed by this app, so the bound is taken at the saltiest plausible open-ocean surface salinity rather than the local value.",
  "No correction is applied to any reported value: the bound describes how far a collapsed cap reading can be wrong, it does not repair it.",
  "A reading at the freezing point is not evidence of sea ice, and says nothing about any organism or ecosystem.",
];

/** One-line, provenance-tagged statement of the bound. */
export function formatSubZeroSstCapBound(bound: SubZeroSstCapBound): string {
  return `GIBS renders all sea surface temperature below ${bound.upperC.toFixed(
    2
  )} °C as one open cap; for open seawater that cap is bounded below by the freezing point, ${bound.lowerC.toFixed(
    2
  )} °C at ${bound.boundSalinityPsu} PSU (${
    SEAWATER_FREEZING_POINT_METHOD.authority
  } ${SEAWATER_FREEZING_POINT_METHOD.series} ${
    SEAWATER_FREEZING_POINT_METHOD.number
  }), so it spans ${bound.widthC.toFixed(
    2
  )} °C rather than being unbounded; not a marine-biology observation`;
}
