/**
 * Probe, compare, and legend notes that are not needed to draw the first
 * frame. Importing this module is what pulls the science chunk.
 */
export { vegetationSamplingIdentityCsvHeaders } from "../lib/vegetationObservingConstraints";
export { probeRetrievalFailureNote } from "../lib/probeRetrievalFailure";
export { marineAveragedSstCensoringCsvHeaders } from "../lib/marineAveragedSstCensoring";
export { sstNativeSupportNote } from "../lib/sstNativeSupport";
export { sstObservingConstraintCsvHeaders } from "../lib/sstObservingConstraints";
export {
  snowIlluminationCsvHeaders,
  snowIlluminationNote,
} from "../lib/snowCoverIllumination";
export {
  buildProbeCsv,
  normalizeLon,
  PROBE_SCALES,
  scaleValue,
} from "../lib/probe";
export {
  inversionAccuracyCsvHeaders,
  probeInversionAccuracy,
} from "../lib/probeInversionAccuracy";
export {
  probeSstColdEndAccuracy,
  sstColdEndAccuracyCsvHeaders,
} from "../lib/sstColdEndAccuracy";
export { uncalibratedVegetationAccuracyCsvHeaders } from "../lib/vegetationIndexRamp";
export { unvalidatedInversionCsvHeaders } from "../lib/unvalidatedInversionAccuracy";
export {
  probeSstExtremeCensoring,
  sstExtremeBoundPrefix,
  sstExtremeCensoringCsvHeaders,
} from "../lib/probeSstExtremeCensoring";
export {
  aerosolCeilingBoundPrefix,
  aerosolCeilingCensoringCsvHeaders,
  probeAerosolCeilingCensoring,
} from "../lib/probeAerosolCeilingCensoring";
export {
  lstExtremeBoundPrefix,
  lstExtremeCensoringCsvHeaders,
  probeLstExtremeCensoring,
} from "../lib/probeLstExtremeCensoring";
export { averagedAerosolCensoringCsvHeaders } from "../lib/probeAerosolAveragedCensoring";
export { averagedLstCensoringCsvHeaders } from "../lib/probeLstAveragedCensoring";
export {
  probeRecordGaps,
  probeRecordGapsCsvHeaders,
} from "../lib/probeRecordGaps";
export { emptyAtmosphereProbeNote } from "../lib/atmosphereProbeDomain";
export { averagedSstSupportNote } from "../lib/marineAveragedSstSupport";
export { vegetationAveragedSupportNote } from "../lib/vegetationAveragedSupport";
export { vegetationChartedRecordNote } from "../lib/vegetationChartedRecord";
export { gldasAveragedSupportNote } from "../lib/gldasAveragedSupport";
export { gldasChartedRecordNote } from "../lib/gldasChartedRecord";
export { airTemperatureAveragedSupportNote } from "../lib/airTemperatureAveragedSupport";
export { airTemperatureChartedRecordNote } from "../lib/airTemperatureChartedRecord";
export { snowAveragedSupportNote } from "../lib/snowAveragedSupport";
export { snowChartedRecordNote } from "../lib/snowChartedRecord";
export { emptyMarineProbeNote } from "../lib/marineProbeDomain";
export { emptySnowProbeNote } from "../lib/snowProbeAbsence";
export { emptyVegetationProbeNote } from "../lib/vegetationProbeAbsence";
export { emptySoilProbeNote } from "../lib/soilProbeDomain";
export { emptyLstProbeNote } from "../lib/lstProbeDomain";
export {
  seasonalSamplingBalance,
  seasonalSamplingCsvHeaders,
} from "../lib/seasonalSamplingBalance";
export { sstSamplingIdentityCsvHeaders } from "../lib/seaSurfaceTemperatureSamplingIdentity";
export { lstSamplingIdentityCsvHeaders } from "../lib/lstObservingConstraints";
