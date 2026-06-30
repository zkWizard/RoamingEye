# Night Watch — Build Log

An autonomous overnight hardening run on RoamingEye. Written as a methods log so
every decision is traceable. All work is on branch **`feat/night-watch`** (PR
below), stacked on the existing PR queue.

## TL;DR

RoamingEye is now meaningfully more robust, its high-resolution imagery is
**cloud-aware and provenance-tagged**, the test suite is broader and
deterministic, and there's a complete, shareable documentation + community
package (README, architecture, data catalogue, roadmap, a flagship RFC, and 10
seeded contributor issues). Everything is CI-green and browser-verified.

---

## What shipped (by phase)

### 1. Robustness

- **Resilient networking core** (`src/lib/net.ts`): every data fetch now has
  timeouts, bounded exponential-backoff retries, and abort support. Geocoding,
  country lookup, and overlays route through it.
- **Cloud-aware high-res scene selection** (`src/lib/sceneSelection.ts`): the
  study patch no longer blindly samples a fixed day (often cloudy/off-swath). It
  probes ~10 candidate acquisition dates with tiny thumbnails, scores each for
  usable coverage (rejecting no-data black and saturated cloud), and drapes the
  **clearest** pass — Sentinel-2 (HLS S30) preferred, Landsat (HLS L30) fallback.
  When nothing is usable it says so instead of showing a broken tile. The study
  chip now reports the resolved **instrument · date** (provenance).

### 2. Quality / accessibility

- Replaced the deprecated `THREE.Clock` with `THREE.Timer` (removed per-frame
  console warnings).
- Accessible label + role on the globe canvas.

### 3. Testing & CI

- New Playwright e2e for the toolbar and hover readout.
- Made the e2e suite **deterministic** (serial) — parallel page loads were
  saturating the network (each load warms the imagery prefetch) and causing
  flakes.
- Unit coverage up to **51 tests** (added net + scene-selection logic).

### 4. Docs & community (the shareable package)

- **README** — rewritten: research-voiced, authored SVG banner, scientific
  use-case table, provenance table, contributor CTAs, badges.
- **ARCHITECTURE.md**, **DATA_SOURCES.md**, **ROADMAP.md**, **CHANGELOG.md**.
- **docs/rfcs/RFC-001-tiled-imagery-streaming.md** — the flagship design proposal
  for sharp-zoom-everywhere, with incremental milestones sized for contributors.
- **docs/adding-a-data-layer.md** — how to add a layer/overlay.
- **10 seeded GitHub issues** (#18–#27): 6 `good first issue`, 4 `help wanted`
  (incl. the flagship RFC-001 milestone 1).

---

## Bugs found & fixed (in the new work)

1. **ImageBitmap closed before `drawImage`** in the scene probe → every coverage
   score was 0 (silently). Reordered.
2. **Cascading-abort race** — each resolve aborted the previous controller, so
   rapid month changes aborted the live probes too. Replaced with a sequence
   guard.
3. **Sparse candidate dates** — fixed days [6,12,18,24] missed HLS's
   orbit-specific acquisition dates; widened to ~every third day.
4. (Earlier in the stack) near-plane clipping and patch back-face culling for
   close zoom — fixed previously, validated again here.

---

## Decisions made autonomously (and why)

- **Did not** attempt the full tiled-streaming engine unattended — too large/risky
  for an unsupervised run. Instead wrote **RFC-001** so it becomes a well-specified
  community effort.
- **Did not** merge anything to `main` — that's the maintainer's call.
- HLS fallback order **Sentinel-2 → Landsat** (Sentinel-2 is finer/more frequent).
- Coverage thresholds (usable ≥ 0.04, good-enough ≥ 0.35) — heuristics, tunable.
- Probe at 96px thumbnails, full-res patch at 4096px — balances cost vs. clarity.
- e2e runs serially in CI for determinism.

## Flagged for you (small, optional)

- The Code-of-Conduct contact is still a placeholder (`@zkWizard`); set a real
  email when convenient.
- README/socials would pop with 2–3 real screenshots (I can't write image files
  from the headless preview). Easy to capture from a running `npm run dev`.
- Consider enabling **CodeQL default setup** and installing the **DCO GitHub App**
  (both noted previously).

---

## PR & merge order

This run is **PR #28** (`feat/night-watch`), stacked on the existing queue. Merge
in order so each retargets to `main` and runs CI:

**#15 → #16 → #17 → #28**

(#15 real-time scrub · #16 research tools · #17 study region · **#28 night-watch hardening**.)

## Recommended next steps

1. Merge the stack (above), then share the repo — the README + seeded issues are
   ready for socials/forums.
2. Pick the next milestone: **RFC-001 milestone 1** (tile math) is the highest-
   leverage and is contributor-friendly; or **drawn study regions + charts** for
   immediate researcher value.
3. Tune scene-selection thresholds against more regions/seasons if needed.

— Logged by the night-watch run.
