import type {
  PlaceObservationExportLayerId,
  PlaceObservationExportSample,
  PlaceObservationUnavailableReason,
} from "./placeObservationExport";
import type { YearMonth } from "./timeline";

/**
 * Build an explicit unavailable placeholder for a place-observation sample.
 *
 * Search workflows install these records before asynchronous sampling starts,
 * so a failed source request still produces a reproducible export rather than
 * either omitting the product or leaving an unexplained null value.
 */
export function environmentUnavailableSample(
  layerId: PlaceObservationExportLayerId,
  dataMonths: readonly YearMonth[],
  unavailableReason: PlaceObservationUnavailableReason = "sampling-failed"
): PlaceObservationExportSample {
  return {
    layerId,
    observations: dataMonths.map((dataMonth) => ({
      dataMonth: { ...dataMonth },
      value: null,
      unavailableReason,
    })),
  };
}
