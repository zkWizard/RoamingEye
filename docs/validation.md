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

## Results (measured 2026-07-09)

| Layer                 | RMSE                   | Colours recovered | Verdict                           |
| --------------------- | ---------------------- | ----------------- | --------------------------------- |
| Aerosol optical depth | **0.13** (scale 0–0.9) | 180 / 180         | Good — usable for absolute values |
| Sea surface temp      | 5.1 °C                 | 128 / 213         | Coarse — relative use recommended |
| Soil moisture         | 8.2 kg/m²              | 21 / 50           | Coarse — relative use recommended |
| Air temperature (2 m) | 19.0 K                 | 46 / 90           | Poor absolute accuracy            |
| Precipitation         | 20.4 mm/day            | 27 / 50           | Poor absolute accuracy            |
| Land surface temp     | — (all no-data)        | 0 / 250           | Gradient misses GIBS's hues       |

## What this means (and doesn't)

- **Absolute values** from these inversions carry large uncertainty for
  temperature, precipitation, and soil moisture, because our legend gradients
  are coarse (a handful of stops) approximations of GIBS's finely-hued
  colormaps. For land-surface temperature the gradient misses GIBS's cold-end
  colours entirely, so those pixels read as no-data. Aerosol optical depth is
  the exception — its palette is simple enough that inversion is tight.
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
