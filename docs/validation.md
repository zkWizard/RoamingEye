# Probe inversion validation

_How accurate is the point/region probe, really?_ This page answers that with
numbers, honestly — including where the tool is weak.

## What is validated

RoamingEye's probe reconstructs a physical value by sampling a pixel of NASA
GIBS's **rendered** imagery and inverting its colour through our legend
gradient onto the layer's physical scale. GIBS publishes the **colormap** it
draws each layer with — the authoritative mapping from data value to colour.
So we can measure the probe's inversion directly: feed every colour in GIBS's
colormap through our production inversion and compare the recovered value to
the true one.

The residuals below are the **real accuracy of the inversion pipeline** for
each calibrated layer. They are re-measured against the live colormaps weekly
(`contract/inversion-validation.contract.test.ts`); this table is kept in sync
by a CI drift-guard.

## Results (sea surface temp re-measured 2026-08-11; others 2026-07-09)

| Layer                 | RMSE                   | Colours recovered | Verdict                           |
| --------------------- | ---------------------- | ----------------- | --------------------------------- |
| Aerosol optical depth | **0.13** (scale 0–0.9) | 180 / 180         | Good — usable for absolute values |
| Sea surface temp      | **1.0** °C             | 213 / 213         | Good — usable for absolute values |
| Soil moisture         | 8.2 kg/m²              | 21 / 50           | Coarse — relative use recommended |
| Air temperature (2 m) | 19.0 K                 | 46 / 90           | Poor absolute accuracy            |
| Precipitation         | 20.4 mm/day            | 27 / 50           | Poor absolute accuracy            |
| Land surface temp     | — (all no-data)        | 0 / 250           | Gradient misses GIBS's hues       |

Sea surface temperature was `5.1 °C` over `128 / 213` colours until
2026-08-11. Its legend was a smooth cool-to-warm gradient, but GIBS renders
MODIS SST on a _spectral_ ramp — magenta and deep blue for cold water,
green/yellow through the subtropics, red at the warm end. The two ramps
disagree most in the middle, and the effect was not subtle: **all 27 ramp
colours between 20 °C and 24 °C fell outside the no-data distance**, so
ordinary subtropical water probed as "no data", while a true 8 °C inverted to
0.0 °C. Rebuilding the stops from that colormap recovers every published ramp
colour.

One deliberate exception remains at the cold end. GIBS's 0–2 °C colours sit
only **53 units** from the black it renders where the L3 product carries no
SST — inside the 60-unit no-data threshold — so drawing them faithfully would
turn land, sea ice, and cloud into plausible near-freezing water. The legend
therefore anchors its cold end at GIBS's ~2 °C hue instead. Empty pixels stay
rejected; the price is absolute accuracy below ~4 °C, where RMSE is 2.8 °C
against 0.1–0.4 °C over the rest of the ramp. Water that cold is also where
MODIS most often reports no SST at all. Separately, a heavily compressed
near-black pixel (≳ 20 per channel away from black) can still reach the deep
blue cold stops; the place card addresses that with its own tighter threshold.

## What this means (and doesn't)

- **Absolute values** from these inversions carry large uncertainty for air
  temperature, precipitation, and soil moisture, because their legend gradients
  are coarse (a handful of stops) approximations of GIBS's finely-hued
  colormaps. For land-surface temperature the gradient misses GIBS's cold-end
  colours entirely, so those pixels read as no-data. Sea surface temperature
  and aerosol optical depth are the exceptions — their stops are taken from the
  colormap GIBS renders with, so inversion is tight across the whole ramp.
- **Relative and temporal analysis is far more robust.** Trends (seasonal
  Mann-Kendall / Sen's slope), anomalies, and seasonality depend on the
  _ordering_ of values, not their absolute calibration, and survive a
  monotone inversion error. This is the intended primary use of the probe, and
  every export is labelled `APPROXIMATE`.
- **This does not validate the GIBS L3 products** against ground truth — that
  is the instrument teams' published validation, which we cite (see
  [`DATA_SOURCES.md`](../DATA_SOURCES.md) and the per-dataset DOIs). We validate
  only our reconstruction of the rendered imagery.

## The path to accurate absolute values

The fix is to invert against **GIBS's real colormap entries** rather than our
decorative gradient — which would collapse these residuals to the quantization
floor. That is tracked as [#170](https://github.com/zkWizard/RoamingEye/issues/170)
and is the natural next flagship for the probe.

Publishing these numbers — the weak ones included — is deliberate: a research
instrument earns trust by stating its limits precisely, not by claiming uniform
accuracy.
