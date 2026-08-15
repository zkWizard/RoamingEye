# Owner's backlog

The maintainer's priority queue for the agent fleet. **Rung zero of every
specialist's impact ladder:** before starting your own idea, scan _Owner's
picks_. If an unclaimed item falls in your domain, that item is this run's
work — implement it, check it off in the same PR, and cite this file in the
PR body. One item per PR.

_Agent-verified candidates_ are defects and gaps an agent found, verified, and
deferred. The maintainer promotes them into Owner's picks; an agent may also
take one directly when no Owner's pick applies to its domain.

## Owner's picks

<!-- Maintainer: add items here in any format — one-liners are fine.
     The implementing PR checks the item off and moves it to Done. -->

- [ ] _(empty — zkWizard seeds 5–10 quality-of-life items)_

## Agent-verified candidates

- [ ] **`.error-toast` and `.offline-banner` have no `aria-live`** — a toast
      nobody hears. Verify what announces today; add live regions where
      warranted. _(uiux notebook, run 4.)_
- [ ] **Declare `color-scheme: light`/`dark` per theme.** Root cause of the
      invisible UA focus ring found in uiux run 3; also fixes UA scrollbars and
      form controls in dark theme. Needs visual-regression care.
- [ ] **Sub-WCAG tap targets** (2.2 AA 2.5.8 wants ≥24×24; mobile guidance
      44×44). `.hint__shortcuts` is 21.6px — the smallest control in the app.
      Timeline steppers are 26×26 at 390px with centres 31.6px apart; the
      HUD-safe fix shape is in the uiux notebook (pseudo-element negative-inset
      hit expansion — panel height must not change). Also sub-44 at 390px: the
      "Find software", "Fleet status", "Copy link", "Save PNG", "Imagery URL",
      "Compare", and "Draw region" buttons plus the layer trigger.
- [ ] **Land-cover freshness is manual.** MCD12Q1 is annual and excluded from
      the boot probe by design; once a year, verify the new product year
      against GIBS and bump `LAYERS.landcover.latest` (currently 2024).
      _Checked 2026-08-15: DescribeDomains still ends at 2024-01-01
      (`2021-01-01/2024-01-01/P1Y`) — no bump due. Next check ~2026-12._
- [ ] **Precipitation currency.** GLDAS publishes ~5 months behind. Evaluate
      GPM IMERG monthly (`GPM_3IMERGM`, ~2-month lag) as a replacement or
      additional layer — a data-sourcing decision, not a bug fix.

## Done

<!-- The shipping PR moves its item here, with the PR number. -->

- [x] **Say what "current" means, per layer.** (#953) The timeline status row
      now carries a resting caption naming the layer's record end and how far
      behind the calendar it sits — "Newest data: Jun 2026 · 2 months behind
      Aug 2026", or "· annual product" for land cover — with the product-level
      reason on its tooltip, and the disabled forward stepper says why it
      stops. The lag is computed from the record end, so it follows the boot
      freshness probe rather than drifting.
