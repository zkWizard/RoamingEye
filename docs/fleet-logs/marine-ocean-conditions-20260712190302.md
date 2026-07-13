# Marine ocean-conditions slice

- Branch: codex/marine-ocean-conditions-20260712190302
- Base: codex/platform-expansion-foundation
- Implementation commit: de63648
- Draft PR: https://github.com/zkWizard/RoamingEye/pull/201
- Task: fleet/expansion-queue.json marine-biology/ocean-conditions

## Delivered

- Added a pure sea-surface-temperature condition summary module using the existing `sst` layer provenance and calibrated SST unit.
- Kept footprint context explicit: water, land-mixed/coastal, land, and unknown/missing coverage are separate states.
- Added focused tests for water, coastal/land-mixed, land, missing, and invalid-source cases.

## Validation

- `npm test -- --run src/lib/oceanConditions.test.ts` - 4 passed
- `npm run typecheck` - passed
- `npx prettier --check src/lib/oceanConditions.ts src/lib/oceanConditions.test.ts` - passed

## Limitations

- Describes only supplied MODIS/Aqua SST observations; no biological abundance, habitat, ecosystem-health, risk, causal, or forecast claims.
- Footprint context is supplied by the caller and is not inferred from missing SST values.
- Temperature bands are descriptive SST thresholds only.

## Next Slice

Connect the descriptive SST condition summary to probe or place-insight output with visible footprint context, valid fraction, and MODIS/Aqua provenance.
