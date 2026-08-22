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

- [ ] **The high-resolution study region has no way in.** `StudyChip.show()`
      and `StudyRegion.show()` are called from nowhere in `src/`.
      `main.ts:328` still builds the chip and wires `exitStudyRegion`, and
      `main.ts:996` still calls `studyChip?.hide()`, but nothing ever adds
      `is-visible` — and `.study-chip` is `display: none` until something
      does (`style.css:1481`). The entry point was removed by `9f7ae50`, so
      issue #26's flagship "high-resolution study region" is unreachable by any
      gesture, while the scaffolding for it still ships in the bundle.
      `e2e/features.spec.ts:611` pins the broken state by asserting the chip
      is NOT visible. _Verified 2026-08-22 (uiux r99, re-verified r102)._
      Two opposite fixes are both defensible — revive the entry point (scene
      and science work, not presentation) or delete the dead path (the Editor
      agent's subtraction mandate) — which is why this is filed for the
      maintainer to call rather than taken by either.

- [ ] **Land-cover freshness is manual.** MCD12Q1 is annual and excluded from
      the boot probe by design; once a year, verify the new product year
      against GIBS and bump `LAYERS.landcover.latest` (currently 2024).
      _Checked 2026-08-15: DescribeDomains still ends at 2024-01-01
      (`2021-01-01/2024-01-01/P1Y`) — no bump due. Next check ~2026-12._
- [ ] **Precipitation currency.** GLDAS publishes ~5 months behind. Evaluate
      GPM IMERG monthly (`GPM_3IMERGM`, ~2-month lag) as a replacement or
      additional layer — a data-sourcing decision, not a bug fix.
- [ ] **The bottom HUD still covers the aim below ~610px of viewport.** #980
      moved the collision threshold from ~722px down to ~610px by taking the
      panel's spacing out at short heights, which clears every ordinary laptop.
      What remains is the band under it — a 1024x600 netbook, or a desktop
      window dragged short — where the crosshair lands back on the layer
      selector. The spacing is spent, so closing the rest means ~101px from
      content: a collapsible or compact panel below the threshold, or biasing
      the globe's rendered centre upward (which issue #93 argues against).
      A design decision rather than a tweak, which is why #980 stopped here
      instead of guessing at one.
- [ ] **The call the two items above wait on has been made (#1023): the panel
      is collapsible below the existing 720px height threshold.** The reader
      folds it; nothing folds on its own, and the fold keeps the layer selector
      and the provenance line, so the product ID and the month survive it. An
      expanded panel is unchanged in height, which is why neither of the two is
      closed by that PR alone — it shipped the affordance and nothing else.
      What each still needs, now that the mechanism exists:
      the netbook band gets a recoverable view rather than a fixed one, so what
      is left there is whether the panel should also open folded below some
      height, which is a second decision and a smaller one. Landscape phones
      have since answered it for their own case only: the panel opens folded
      below 460px, where expanded it does not fit the window at all. The netbook
      band is not that case — at 1024x600 the panel fits and merely covers the
      crosshair — so the question there is still open, and it is now a question
      about a reader's default rather than about whether the mechanism exists.
      The phone caption, which was the third of these, is closed instead by
      #1025 and did not need the fold: the caveat moved to a surface that is
      out of flow, so it never spent the height the fold frees.
- [ ] **Should the panel also open folded on a phone held upright?** The
      question above has been asked twice about viewports that are SHORT. The
      case it has never covered is narrow and TALL, and there the outcome
      inverts: the bigger the phone, the smaller the globe. Measured on the
      live site at 390x844, the panel opens expanded at a top of 347px and
      stands 373px — 44.2% of the window — and the viewport centre hit-tests
      the legend rather than the globe, so the aim has to move 80px up to
      reach it. Neither existing rule fires: the spacing trim of #980 is gated
      at 720px of height and the auto-fold of #1027 at 460px, and every modern
      phone in portrait is 844-932px tall, clearing both. This is a decision
      about a reader's default rather than a missing mechanism — #1023 shipped
      the fold and #1039 already folds on the way into a probe — which is why
      it is filed here rather than guessed at. Same shape as the netbook-band
      question above, and worth answering alongside it. Changing a boot-time
      fold default is HUD-trap territory, so whoever takes it owes a full
      local e2e run.

- [ ] **An open probe still covers a stretch of the legend on a TALL window
      wider than a phone.** Found while measuring the short-window collision,
      and left open for the same reason the two questions above are: it is a
      decision about a reader's default, not a missing mechanism. Above 720px
      of height the probe keeps its centred position, and above 540px of width
      no fold control is rendered at all — by the design the style.css note
      calls "the two arms enter and leave together" — so the panel cannot fold
      and folding it anyway would strand the reader with no way back. Measured
      on main with a probe open at 900px of height, the probe overlapped the
      panel by 227px at 560px of width, 215px at 640, 116px at 700, 105px at
      820, 91px at 900 and 96px at 1280. What it covers is the colour ramp
      rather than a control, with one exception: between 541px and about 880px
      of width the layer selector is covered too (the probe's chart canvas at
      560-640px, the probe itself at 820px), and there the reader cannot change
      the layer without dismissing the probe. That narrow band may deserve
      closing on its own terms. The wider question of the legend is the same
      one the netbook band and the upright phone are already waiting on — and
      note that the netbook itself is no longer an instance of it, since
      1024x600 is inside the 720px band where the probe now top-anchors.
      _The control half is closed (#1049): above 720px of height the probe
      top-anchors between 541 and 880px of width, so the layer selector is
      reachable at every width that measured blocked, and the panel clears
      by 26-187px. Above 780px of height it costs nothing, because the
      panel height does not follow the window height and the probe fits
      above it at full size; below 780 the chart gives up its fixed 150px,
      as it does in the rules on either side. The legend half is untouched
      and still open: past 880px the probe keeps its centred position, and
      what it covers there is the colour ramp, which is the same
      reader-default question as the two items above._

- [ ] **The panel's fold control is covered by the draw button on a short
      window under a fine pointer, and the fix is structural rather than a
      breakpoint.** Measured on main at `b91e09e` by hit-testing
      `#hud-collapse`'s centre across 42 viewports: the centre is lost
      outright at 932x320, at 568/667/740/932 x330, at
      568/667/740/812/932/1024/1100 x340, at 568/667/740/812 x350 and at
      740x355, and is kept but left under the 24px reach floor at a further
      fourteen sizes between 310 and 365px of height. Every width at 300px
      and everything at 370px and above is clear, as is every viewport wider
      than 1200px. So the band is heights 310-365 at widths 568-1100, not the
      320-340 an earlier pass recorded.
      What makes it structural is that the two controls are pinned in
      different coordinate systems: `.draw` takes the viewport's left inset
      (`clamp(1rem, 3vw, 2rem)`) while `#hud-collapse` takes the left edge of
      `#controls`, which is capped near 880px and centred. The gap between
      them is therefore not a constant — the fold control's left edge runs
      26px at 568 wide to 169px at 1200, while the draw button's right edge
      barely moves — which is why the one-liner that already fixes the coarse
      case does not transfer: under a coarse pointer every viewport is
      narrower than the cap, so the panel's left edge IS the viewport inset.
      Three one-line candidates were measured and eliminated. A fixed
      sideways offset cannot cover the band (+44px clears 568-932 and leaves
      1024 and 1100 blocked; the +115px that clears 1100 puts the pill into
      the globe's aim at 568). Moving `.draw` up has no room — at 568 and 667
      the header column bottoms out 3-6px above the draw button's top, and
      clearing the fold control would land the draw button on the theme
      toggle. Raising the fold control's `z-index` is not merely unwise but
      impossible: `#draw` is a sibling of `.overlay--bottom`, `.overlay`
      establishes a stacking context at `z-index: 2`, and no child value can
      escape a parent stacking context — the only lever is raising the whole
      bottom overlay past 4, which puts the panel over `#search`, `#export`,
      `#compare` and `#draw`.
      What is left is a design decision of the same class as the netbook band
      above: either `.draw`'s x follows the panel's left edge, or the draw
      button leaves that corner below roughly 370px of height. Filed rather
      than guessed at, and filed with the numbers so it is not re-derived.

## Done

<!-- The shipping PR moves its item here, with the PR number. -->

- [x] **A phone held in landscape reached none of the nine map overlays.**
      (#1027) Closed by keying the bottom-bar layout on height as well as
      width, which is the fix the item itself named, and by paying the vertical
      budget that had stopped it. The overlay column is capped so centring
      always clears the top-right buttons, and a toggle stands 60.6px, so the
      column shows its first one only above 460px: at 844x390, 932x430, 740x360
      and 667x375 a hit test reached 0 of 9, against a 15px sliver of bar still
      wearing its "more items this way" fade. With the bar across the bottom it
      is 9 of 9 at all four, and the row's scroll width is inside its client
      width, so none of them needs a sideways swipe either.
      What the item filed as the blocker was the panel: 266px against a
      360-430px viewport, whose top went to -33px at 740x360 and -18px at
      667x375 once the bar took its 3.6rem. #1023's fold is what pays for it,
      and the second decision that item left open is made here in the narrowest
      form it can be — the panel opens folded below the same 460px the bar takes
      over at, and nowhere else. The reason it is defensible is what the fold
      keeps: the layer selector and the provenance line, so the product ID and
      the month are rendered in the default state and no citation sits behind a
      gesture. Panel tops are now 228, 268, 182 and 197px, the fold control is
      on screen at each, and the centre of the view hit-tests to the globe.
      Rotating into landscape is treated as the same event as booting into it,
      since it arrives at the same off-screen panel; rotating back out leaves
      the reader's own choice alone. The 461px arm on the column rules is what
      keeps the two layouts exclusive: 1024x600 and every taller viewport is
      byte-identical, which e2e/landscape-overlays.spec.ts pins alongside the
      four landscape sizes.

- [x] **A phone drops the layer's caption, and with it the caveat.** (#1025)
      Closed by moving the caption rather than by finding it height. The item
      had converged on "wait for a collapsible panel", and the re-measurement
      that #1023 asked for confirmed the fold does not reach this case: the
      fold is `max-height: 720px` and the caption hide is `max-width: 540px`,
      so a 390x844 portrait phone — the viewport `hover-tooltip.spec.ts`
      guards — gets the caption dropped and no fold control to pay for it.
      The height arithmetic re-ran the same way it did before: +19px on nine
      layers and +34px on the widest two, against 53px of clearance between
      the panel and the volcano point at 390x844, which CI's taller text
      metrics (~35-50px) already spend. So the naive un-hide is still red, and
      `landcover` at that width already covers the point with the caption off.
      What the item had not questioned was the assumption that the caption must
      live under the color bar. Its other copy was `option.title` on each
      dropdown entry, which is the right place and the wrong mechanism: a
      touch screen cannot hover, so on exactly the widths that drop the caption
      the `title` is inert. Rendering that same string as a visible second
      line inside each option costs the HUD nothing — the dropdown panel is
      `position: absolute` with `max-height: 46vh; overflow-y: auto`, and it is
      already single-column below 540px, which is the same boundary the legend
      hides at. So all eleven captions are readable on a phone, in the place a
      reader is choosing a layer, and the panel over the globe is byte-identical
      in height — pinned by an assertion that the panel's top is unchanged
      across opening the dropdown. The legend rule stays, with its comment
      rewritten from "retire it" to where the caveat went.

- [x] **The keyboard aim named the ground but never the marker on it.**
      (#988) The pointer readout has two modes: `pickMarker` and
      `pickLine` name an overlay record when one is under the cursor, and
      only when none is does it fall back to `describe`, the
      coordinates-plus-territory text. The keyboard aim added in #977 called
      `describe` alone, so the five registered sources — cities, volcanoes,
      the earthquake magnitude bands, the user's location and the plate
      linework — were unreachable without a pointer: a keyboard user who
      arrowed a volcano into the middle of the view read its latitude, never
      that it was a volcano, and because the spoken aim called `describe`
      directly too, a screen-reader user heard the same. That left 1,196
      bundled GVP volcanoes, the live USGS M4.5+ feed and the Bird (2003)
      linework with no keyboard path at all, against a doc comment on
      `describe` asserting the aim "must read identically" to what the
      cursor gets. The aim is the camera subpoint and `camera.lookAt(0,0,0)`
      puts that at NDC (0, 0) by construction, so the pointer's own hit test
      answers for the reticle unchanged — same sources, same thresholds, same
      marker-over-line precedence — and sharing the ray is what keeps the two
      readouts from drifting rather than a second copy of the logic. What the
      filing left open was the offset: a record can be named while Enter
      charts a subpoint up to 76km away. It is named without snapping or
      qualifying, on two measurements. The hit radius IS the marker's own
      drawn radius — `POINT_THRESHOLD` 0.012 against markers of size
      0.022–0.024, all `sizeAttenuation` — so a hit means the reticle is
      inside the dot on screen rather than near it. And naming a record was
      never a promise about what gets charted: the pointer has always named a
      marker while its own click probed the raw surface point under the
      cursor, so Enter charting the subpoint is the existing contract, not a
      new discrepancy. Snapping the aim instead would move the reticle off the
      point the arrow keys steer and the hash records, which is the one thing
      about this aim that cannot move. The assertions boot on an isolated
      volcano and pin the record in the readout and in the live region, pin
      the reticle still dead centre, and pin the two ways the aim must stay
      quiet: 1.24° off the same volcano, and directly over it with the overlay
      switched off.

- [x] **The phone bottom bar sat on the credits line.** (#983) At 540px
      and under the overlay toolbar becomes a bar pinned across the bottom of
      the screen, and the bottom overlay moves up to clear it — by a flat
      3.6rem, against a bar that measures 76px. The 18px shortfall put the last
      line of the attribution underneath the bar, so the taps meant for the
      "Data providers" button, the repository link and the feedback link went
      to the toolbar instead: all three were dead on a 430x932 Pro Max and at
      the 540px breakpoint, two on a 360px Android, one on a 390px iPhone,
      where the row wraps and only its second line is buried. The bar's panel
      is translucent, so the links still showed through it greyed out and the
      row read as a styling choice rather than three dead controls — only a hit
      test named the toolbar as what received the tap. Toolbar.ts already
      observes the bar to keep its overflow fade in step and now publishes its
      measured height as `--toolbar-height`, and the credits line is lifted by
      the shortfall between that and the reserve already applied; the home
      indicator comes along for free, since `env(safe-area-inset-bottom)` is
      inside the bar's own padding and so inside that number. The lift is on
      the credits line alone rather than on the reserve, because the overlay is
      bottom-anchored and raising it carries the HUD panel up too — which is
      exactly what the first attempt did, and the panel landed on the globe
      point hover-tooltip.spec.ts hovers at 390px, green locally and red on CI
      where the panel's text wraps taller. Desktop widths are untouched. The
      assertions hit-test every control in the row at four phone sizes, drive a
      real tap at the providers button's own coordinates, and pin the panel
      above as unmoved when the bar's height changes.

- [x] **A pixel of window height cost two layer toggles.** (#981) The toolbar
      column is capped so that centring it always leaves the 200px the
      Share/Save/Compare buttons occupy, and short windows anchored it at that
      200px outright — but the short-window rule also tightened the cap by a
      further 130px, reserving room it said the bottom HUD needed. The HUD panel
      is 880px wide and centred, so it was never in the bar's column: at 1366px
      there is 152px of clear air between them, and at the narrow desktop widths
      where the boxes do meet, the 18–66px they share is the panel's empty right
      margin. Above the breakpoint the bar had always run 156–191px down into
      the panel's band at those widths without covering a single control, so the
      reserve bought clearance the layout did not need. What it did buy was a
      step at the breakpoint: 421px of column at 821px tall and 290px at 820px,
      so dragging a window one pixel shorter dropped two of the nine toggles and
      a third of the layer switcher went behind the fade. Both layouts now share
      the one cap, so the column shortens smoothly with the window instead —
      five of nine toggles on screen at 1366x768 where three were, four at 720px
      tall where two were, and two at 560px tall where the old cap left 30px of
      column and no whole toggle at all. Nothing moved horizontally and no
      control changed size; the assertions pin the absence of the step and the
      panel's clicks at the widths where the boxes overlap, since the honest
      risk here is a future panel growing wide enough to reach the bar.

- [x] **The reticle marked a point the panel was covering.** (#980) The aim the
      keyboard turns the globe under is the camera subpoint — it renders at the
      exact centre of the canvas and it is the point Enter charts, so unlike a
      cursor it cannot be moved somewhere roomier without lying about which
      pixel it names. The bottom panel is the half of that pair that could have
      moved and did not: it measured 301px tall at 900px of viewport and 301px
      at 540px, height-invariant, so it was the panel that climbed over the aim
      as the window shortened. Below about 722px tall the crosshair was drawn
      over the HUD, naming a pixel of the globe the HUD was covering; at the
      665px a 1366x768 laptop leaves after browser chrome it sat on the layer
      selector's own label, and by 600px on the colour ramp. Since a third of
      the panel's height was the spacing between its rows rather than anything
      written in them, that spacing carries the fix and the words do not: every
      caption, the legend source note and the provenance line render at full
      size and full length, and no claim or citation moved. The threshold is
      pinned by assertions rather than by the measurement that motivated it,
      because the panel's captions accrete and a purely visual fix would have
      been eaten by the next clause added to the source note without anything
      going red.

- [x] **The keyboard had no aim on the globe.** (#977) Arrow keys turned the
      globe and Enter charted the point in the middle of the view, but nothing
      said where that point was. A pointer aims with a cursor and the hover
      readout follows it; a keyboard has no cursor, and the camera subpoint it
      turns the globe under was neither drawn nor named. The only way to find
      out where you had arrived was to press Enter and read the probe that
      opened — a fetch, a panel and a dismissal, to answer which way am I
      facing — and a screen-reader user got silence either way, because the
      readout the cursor gets is a visual tooltip with no live region behind
      it. A reticle now marks the point so the keys have a visible target, and
      the same readout the cursor gets names it, offset clear so the pixel
      being named is never covered by the thing naming it. The description is
      shared by both paths so they cannot drift apart. The live region speaks
      the aim once the turning stops rather than on every press, since a held
      arrow key and the damping after it would otherwise narrate dozens of
      points the user was only passing over. It re-aims on any camera change,
      not just key presses, because a fly-to from search or a drag begun while
      the canvas still holds focus would leave the readout naming a point that
      has left the middle of the view. It appears only on focus-visible, so
      clicking the globe raises nothing — a pointer user already has an aim —
      and it never takes pointer events, so the mark cannot swallow a drag or
      displace the globe in a hit test.

- [x] **Drawing a study region could not be done by keyboard.** (#975) The
      "Draw region" button is an ordinary button, so a keyboard reached draw
      mode perfectly well and then hit a wall. Arming the mode disables
      OrbitControls, so that a drag sweeps a box instead of turning the globe,
      and both of the canvas key handlers bailed out on exactly that flag —
      which meant the arrow keys and Enter the globe had just been given went
      dead the moment draw mode came on. The one instruction in the HUD was to
      drag on the globe, a gesture the user who had just arrived there could
      not make, and Escape, which nothing mentioned at that moment, was the
      only way back out. A drag is two corners plus the travel between them,
      and a keyboard cannot express that as a single gesture, so it splits
      into the two corners alone, taken from wherever the arrow keys have
      aimed the camera. That is the model the globe already uses: Enter acts
      on the point in the middle of the view, and while draw mode is armed it
      means a corner goes here. The outline rubber-bands off the camera
      subpoint on every arrow press, so the box can be seen while it is being
      framed rather than only once it has been taken, which is what a drag
      gives a pointer user. A second corner landing on the first keeps the
      first one rather than cancelling: a single arrow press moves in one axis
      only, so pressing Enter, an arrow, then Enter produces a flat box the
      usable-bounds check turns down, and that is the likeliest honest
      mistake — dropping someone out of the mode for it would cost them the
      corner they had already placed, so they stay armed and are told to turn
      further. Arming also hands focus to the canvas, the way opening a dialog
      does, because every gesture the mode accepts happens on the globe and
      focus was being left behind on the button; disarming leaves focus alone,
      so Escape does not pull it away from whatever the user has moved on to.
      Documenting the keys added a fourth group to the help overlay, which
      surfaced a separate defect it had been carrying: the shortcut list
      scrolls once it outgrows the panel and held nothing focusable, so there
      was no way to reach the lower shortcuts without a pointer. It now takes
      focus itself and carries the same accent ring as every other stop.

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
