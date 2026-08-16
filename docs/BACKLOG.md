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

- [x] **The globe could not be operated by keyboard at all.** (#974) The canvas
      has declared `role="application"` since the first commit — a role that
      tells a screen reader to stop intercepting keystrokes and hand them to
      the app, on the understanding that the app has its own bindings. It had
      none: no `tabindex` on the canvas and no `keydown` listener anywhere on
      it, so the globe, the primary control, was the one thing in the app a
      keyboard could not reach, and the role was turning a user's reading mode
      off in exchange for nothing. The help overlay was honest about the gap
      rather than hiding it, listing Drag, Scroll, Click and Hover — four
      pointer gestures and no keys. The canvas now takes focus and paints the
      same 2px accent ring every other control gets, arrow keys turn the globe,
      plus and minus zoom between the bounds the wheel already uses, and Enter
      charts the point in the middle of the view. That point is the camera
      subpoint: a pointer names its own target and a keyboard has to be given
      one, and the only point a keyboard user has already aimed at is the one
      the arrows steer. It is also what the shareable hash records as the
      camera position, so a probe opened this way reproduces from its link like
      any other, and the search fly-to marker is drawn there so the charted
      point is visible and not only readable. The rotation step scales with
      altitude on the same ratio a drag uses, because six degrees reads as a
      nudge in orbit and crosses a continent near the surface; latitude stops
      at 85°, where a viewpoint still has a heading; longitude is left
      unwrapped so stepping east past the antimeridian continues. The keys are
      inert while something else owns the camera — the region drawer mid-drag,
      the flyer mid-flight — and inert while the search field has focus, which
      is asserted, since typing a place name must not fly the camera
      underneath it. Verified by reading the view back out of the shareable
      hash rather than the scene, which also proves a keyboard-driven view is
      reproducible from its link.

- [x] **The overlay toolbar stole the Compare button's clicks.** (#973) The
      column is centred vertically, so its top edge climbs as it grows. Issue
      #93 identified this exact collision with the top-right buttons and fixed
      it by anchoring the bar below them — but keyed that to a window height of
      820px, and the column has since grown to nine toggles and 609px tall,
      which puts its top edge over the Compare button on any window shorter
      than about 987px. The band from 821 to 1008px tall was therefore left
      unguarded, and it contains 1440x900 and 1280x900, two of the commonest
      laptop viewports. Clicking the middle of Compare there turned the HD
      tiles overlay off and never opened comparison mode, so the imagery
      silently dropped to low resolution; Share and Save lost their centres to
      the same overlap. Fixed by stating the invariant the breakpoint stood in
      for — the centred column is capped so that centring always leaves the
      200px the buttons occupy — which changes nothing above about 1009px tall
      and puts the top edge at exactly 200px below it, the same anchor the
      short-window rule already uses. Bottom clearance improves from 145px to
      200px at 900px tall. The cost is that seven of nine toggles are on screen
      at 1440x900 rather than nine, with the existing edge fade showing the
      rest. Asserted at three viewports plus a sweep of every height from 830
      to 1000, and mutation-tested. Two existing assertions had to move: both
      were pinned at 900px tall as a window with room, which this measurement
      shows was never true.

- [x] **The overlay toolbar hid most of its toggles on a laptop.** (#972) A
      window 820px tall or shorter caps the toolbar and scrolls it internally
      so the column clears the top-right buttons (issue #93), but nothing said
      so: four of the nine toggles are on screen at 1280x800, three at
      1366x768 and two at 1512x700, and the column scrolls with an overlay
      scrollbar that is painted only while scrolling — so at rest the bar
      looked like the whole set and Volcanoes and Quakes appeared not to
      exist. The edge fade that answers this already shipped for the phone
      bottom bar, but the code behind it measured only the horizontal axis,
      which in the capped column is exactly zero, and the gradient was scoped
      to the phone breakpoint. The measurement now picks whichever axis
      actually overflows and the short-window layout gets the same fade turned
      to run down the column. Asserted at three viewports, each checking its
      own premise that the bar overflows at that size, and both halves
      mutation-tested. One existing assertion had to change: the phone spec
      closed by requiring no fade at 1280x800 on the grounds that the desktop
      bar "never overflows", which was the defect recorded as expected
      behaviour — it now makes that point at a height with genuine room.

- [x] **The globe hover tooltip clipped instead of wrapping.** (#970) The
      readout was `white-space: nowrap`, and its placement only ever FLIPPED
      the box to the far side of the cursor — never clamped it — so a line
      wider than the window ran off the edge. Because the flip subtracts the
      full width, the overflow landed on the **left**, which is where an
      overlay record's name sits. Reproduced with the real bundled catalog
      rather than a synthetic string: hovering Tecuamburro put the box's left
      edge at −166px at 1280x800 and at −612px at 390x844, hiding the
      volcano's name at both — so this was never a phone-only defect, and the
      filed estimate of "narrower than ~1200px" was if anything conservative.
      The box now takes a viewport-relative `max-width` and wraps, and the
      offset is clamped to the viewport after the flip. The copy is untouched:
      the provenance #862, #865 and #943 added is all still rendered, on two
      lines at desktop and three at phone width. Offsets moved from
      `left`/`top` to a `transform`, because an offset written to `left` also
      shrinks the box's available width, so the width read back on the next
      pointermove would have been the width at the previous cursor position.
      Asserted at both widths in `e2e/hover-tooltip.spec.ts`, and both halves
      mutation-tested — dropping the clamp fails the phone case at `-187px`,
      restoring `nowrap` fails the wrap assertion at both.

- [x] **A successful overlay enable was the silent outcome.** (#964) Pressing a
      toolbar toggle flips `aria-pressed` immediately — right for the control,
      but it claims the overlay is drawn before its data exists. Measured
      against a feed held for 1.5 s, the button read `pressed` at t=250ms and
      the markers arrived at t=1500ms with no live region changing at all:
      `aria-busy` (#933) covered the wait and then simply vanished. Since the
      arrival of the markers is a change on the globe, and a screen reader
      cannot read the globe, the only outcome a non-sighted user could hear was
      the failure — which #961 had given a toast. A shared visually-hidden
      `role="status"` announcer now reports the result on exactly the enables
      that admitted to waiting, reusing the pending-indicator threshold: if the
      app said "waiting", it owes an ending. Instant cached toggles stay silent,
      because `aria-pressed` already carried that state and a second voice on
      all nine toolbar buttons would be chatter. Both halves are asserted, and
      both were mutation-tested — dropping the announcement fails the positive
      spec, announcing unconditionally fails the negative one with a spurious
      pair including a _disable_ that claims "shown".
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
