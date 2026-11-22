/**
 * Compact GP element set, the fields SGP4 needs from a CelesTrak OMM record.
 * Extra catalog fields (country, object type) are kept when the feed sends
 * them. The public GP groups usually do not.
 */

export interface GpRecord {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE: 0;
  CLASSIFICATION_TYPE: "U" | "C";
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
  COUNTRY_CODE?: string;
  OBJECT_TYPE?: string;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseRecord(value: unknown): GpRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const name = row.OBJECT_NAME;
  const epoch = row.EPOCH;
  const norad = num(row.NORAD_CAT_ID);
  const meanMotion = num(row.MEAN_MOTION);
  const eccentricity = num(row.ECCENTRICITY);
  const inclination = num(row.INCLINATION);
  const raan = num(row.RA_OF_ASC_NODE);
  const arg = num(row.ARG_OF_PERICENTER);
  const anomaly = num(row.MEAN_ANOMALY);
  const bstar = num(row.BSTAR);
  const meanMotionDot = num(row.MEAN_MOTION_DOT);
  const meanMotionDdot = num(row.MEAN_MOTION_DDOT);
  if (typeof name !== "string" || name.trim() === "") return null;
  if (typeof epoch !== "string" || epoch.trim() === "") return null;
  if (
    norad === null ||
    !Number.isInteger(norad) ||
    norad <= 0 ||
    meanMotion === null ||
    meanMotion <= 0 ||
    eccentricity === null ||
    eccentricity < 0 ||
    eccentricity >= 1 ||
    inclination === null ||
    raan === null ||
    arg === null ||
    anomaly === null ||
    bstar === null ||
    meanMotionDot === null ||
    meanMotionDdot === null
  ) {
    return null;
  }
  const objectId = row.OBJECT_ID;
  const classification = row.CLASSIFICATION_TYPE === "C" ? "C" : "U";
  const elementSet = num(row.ELEMENT_SET_NO);
  const rev = num(row.REV_AT_EPOCH);
  const record: GpRecord = {
    OBJECT_NAME: name.trim(),
    OBJECT_ID: typeof objectId === "string" ? objectId : "",
    EPOCH: epoch,
    MEAN_MOTION: meanMotion,
    ECCENTRICITY: eccentricity,
    INCLINATION: inclination,
    RA_OF_ASC_NODE: raan,
    ARG_OF_PERICENTER: arg,
    MEAN_ANOMALY: anomaly,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: classification,
    NORAD_CAT_ID: norad,
    ELEMENT_SET_NO: elementSet === null ? 999 : elementSet,
    REV_AT_EPOCH: rev === null ? 0 : rev,
    BSTAR: bstar,
    MEAN_MOTION_DOT: meanMotionDot,
    MEAN_MOTION_DDOT: meanMotionDdot,
  };
  if (typeof row.COUNTRY_CODE === "string" && row.COUNTRY_CODE !== "") {
    record.COUNTRY_CODE = row.COUNTRY_CODE;
  }
  if (typeof row.OBJECT_TYPE === "string" && row.OBJECT_TYPE !== "") {
    record.OBJECT_TYPE = row.OBJECT_TYPE;
  }
  return record;
}

/**
 * Read a CelesTrak GP JSON body. A non-array is a hard failure (an error
 * page, or a shape we must not cache as "no satellites"). Individual bad
 * rows are dropped. An array of only bad rows is also a hard failure, so a
 * format change is not stored for two hours as an empty sky.
 */
export function parseGpList(payload: unknown): GpRecord[] {
  if (!Array.isArray(payload)) {
    throw new Error("CelesTrak returned an unexpected payload");
  }
  const records: GpRecord[] = [];
  for (const row of payload) {
    const record = parseRecord(row);
    if (record) records.push(record);
  }
  if (payload.length > 0 && records.length === 0) {
    throw new Error("CelesTrak records could not be read");
  }
  return records;
}
