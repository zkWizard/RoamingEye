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

- [x] **Sub-WCAG tap targets.** (#960) `.hint__shortcuts` was 21.6px — the
      only control in the app under the WCAG 2.2 AA floor of 24×24 (2.5.8) —
      and is now 24×24. The chrome buttons all cleared AA but were sized for a
      mouse (29–36px tall), so on a phone they were hittable but fiddly; they
      now take a 44px minimum under `@media (pointer: coarse)`. The query is
      keyed to the input device rather than a width breakpoint, so a narrow
      desktop window keeps its compact chrome and — usefully — the e2e suite,
      which runs a fine pointer in every project, measures the same geometry it
      did before. Two deliberate exclusions: the timeline steppers stay 26×26
      (they clear AA, and at 390px only 3.2px separates them from the 44px
      scrubber track, so a taller hit area would swallow slider drags — their
      centres are also 31.6px apart, so two 44px targets would overlap each
      other), and the search field stays 38px. Both are asserted, not assumed.
- [x] **The `theme-color` meta tracked the OS, not the app.** (#956) The two
      tags in `index.html` were keyed to `prefers-color-scheme`, so a phone
      browser's address bar stayed near-black when someone on a dark-preferring
      OS switched the app to light — the one piece of UA chrome `color-scheme`
      (#955) cannot reach, since it is painted outside the page. `ThemeToggle`
      now owns the tag the way it already owns `data-theme`: on every apply it
      collapses the pair to a single media-less tag and colours it from `--bg`,
      so the bar follows the stylesheet rather than a second hardcoded copy of
      the palette. The static pair stays as the pre-boot first-paint guess,
      which is the same OS fallback the theme resolver uses.
- [x] **Declare `color-scheme: light`/`dark` per theme.** (#955) The page
      declared none, so every widget the browser paints for itself — the
      scrollbars on the layer list, search results, toolbar and modal bodies,
      the native `<select>` popups in the software finder, the search field's
      clear button and caret, and the default focus ring — rendered light over
      the dark glass. It is declared on the `[data-theme]` blocks rather than a
      `prefers-color-scheme` query, so the UA chrome follows the theme the user
      picked instead of the one their OS prefers; those disagree the moment
      anyone touches the toggle. The run-3 focus-ring patch stays: `color-scheme`
      makes the UA fallback ring theme-appropriate, but it is still a ~1px
      hairline, so the app's own 2px accent ring remains the WCAG-grade one.
- [x] **The toast and the offline banner announce, not just appear.** (#954)
      Both already had the right roles (`alert`, `status`), so the original
      "no `aria-live`" framing was off — the real fault was that both were
      toggled with `hidden`, and a `display: none` live region is outside the
      accessibility tree. The banner's text was assigned once at construction
      and never changed again, so it could never announce; the toast wrote its
      message before unhiding. Both roots now stay rendered and the message is
      inserted into them, which is the mutation screen readers act on.
- [x] **Say what "current" means, per layer.** (#953) The timeline status row
      now carries a resting caption naming the layer's record end and how far
      behind the calendar it sits — "Newest data: Jun 2026 · 2 months behind
      Aug 2026", or "· annual product" for land cover — with the product-level
      reason on its tooltip, and the disabled forward stepper says why it
      stops. The lag is computed from the record end, so it follows the boot
      freshness probe rather than drifting.
