To: CLEAN collection team (Climate Literacy & Energy Awareness Network, CIRES / CU Boulder)
Venue: CLEAN — https://cleanet.org/ (peer-reviewed climate & energy education collection, grades 6–16; mirrored by NOAA Climate.gov's teaching portal)
Channel: the **"Suggest a Teaching Resource"** web form — https://cleanet.org/clean/community/suggestresource.html (tick the "I am the developer" box)
Status: DRAFT
Date: 2026-07-27
Claims re-verified: 2026-07-27 — CLEAN submission rules, accepted resource types and review criteria read from cleanet.org; RoamingEye feature/layer claims checked against README.md; live URL is https://roamingeye.org/ (⛔ see the send gate in `outbox/README.md` — HTTPS is not working yet)

<!--
  This is a FORM submission, not a post. The form is short — most fields are one
  line. The only writing that matters is the description field, reproduced below
  under "Field 7".

  Why this venue is a legitimate submission and not self-promotion: CLEAN's form
  explicitly accommodates developers submitting their own resource, with a
  checkbox to receive the reviewers' comments. Tick it.

  Everything here is derived from `classroom-lab-one-pager.md`, narrowed to ONE
  focused concept on purpose — see "Read before submitting", point 2.
-->

---

## Read before submitting

**1. The send gate applies.** The form asks for the resource URL and reviewers will click
it. Do not submit until `https://roamingeye.org/` returns `200` over working HTTPS. A
peer-review panel that hits a certificate warning does not come back for a second look, and
this is a months-long process you get one clean shot at.

**2. Why this is pitched narrowly, and don't widen it.** CLEAN states that "general websites
addressing many aspects of climate or energy science are not as useful as specific ones
geared toward a focused topic." A nine-layer 3D globe described as "explore the Earth" is
exactly the shape they down-rank. So the description below leads with **one** concept —
seasonal vegetation phenology, with snow cover as the parallel case — and treats the rest of
the app as supporting context. Resisting the urge to list every feature is the single
biggest thing that improves the odds here.

**3. Check the framework alignment before you send.** The description references the
Climate Literacy Framework generally rather than citing a numbered principle, because the
framework has been revised and the current edition's numbering was not verified. Spend two
minutes on https://cleanet.org/clean/literacy/ and name the specific principle(s) — a
submission that cites the right one reads as someone who knows the collection.

**4. Expect a long, useful wait.** Triage → two rounds of general review (one educator, one
scientist) → a four-person panel → expert science review. Reviews are returned to developers
on request even if the resource is not accepted, and CLEAN notes that non-acceptance "is
often a question of alignment and granularity, not quality." Either outcome is worth having:
this is the only free expert critique of RoamingEye's _teaching_ value available anywhere in
the pipeline.

**5. Known weak spot, stated honestly below.** "Presence of a teacher's guide" is a scored
line item under technical quality, and RoamingEye has no teacher's guide. The description
links the closest substitutes (`docs/research-recipes.md` and the lesson ideas) and says so
plainly rather than hoping nobody notices. If a reviewer asks for one, that is a concrete,
worthwhile thing to go build.

**6. Do not follow up.** Submit and let the process run.

---

## The submission

### Field 1 — Your name

zkWizard (use your real name here — this goes to reviewers)

### Field 2 — Institution or affiliation

Independent / open-source project (RoamingEye)

### Field 3 — Title of resource

RoamingEye — a browser-based 3D Earth for watching seasonal change in satellite records

### Field 4 — URL of resource

https://roamingeye.org/

### Field 5 — Your email address

_(your address)_

### Field 6 — Resource type

**Materials for creating activities** — an interactive tool / visualization, not a
finished lesson plan. (CLEAN's form accepts "interactive tools, visualizations, maps, or
datasets that can be used to create classroom, lab, or field activities.")

☑ **I am the developer of this resource and would like to receive the reviewers' comments.**

### Field 7 — Additional description or comments

> RoamingEye is a free, open-source (MIT) 3D Earth that runs in a browser tab with no
> account, no install, and no fee. It is built for one thing that is hard to do in a
> classroom: letting students _watch_ a climate variable change over time in real satellite
> data, rather than being shown a finished graph of it.
>
> **The focused use I would like it considered for is seasonal cycles — vegetation
> phenology, and seasonal snow cover.** A student loads the monthly NDVI (vegetation) layer,
> drags a temporal scrubber month by month, and sees green-up and senescence sweep across a
> region they chose themselves; then does the same over a mountain range with the snow-cover
> layer and watches the snowpack advance and retreat. Comparing a temperate site against a
> tropical or desert site in the same two minutes makes seasonality visible as a pattern
> rather than a definition, and makes the case for why a single snapshot misleads.
>
> It goes one step further than a visualization, which is why I think it fits "materials for
> creating activities" rather than "video": clicking any point on the globe charts that
> layer's full record at that location — 26 to 46 years depending on the product — and
> downloads it as a **CSV stamped with the instrument, product, resolution, and acquisition
> date of every value**. Students can plot that themselves in a spreadsheet or notebook, so
> a lesson can run from "look at the pattern" through to "here is my own graph of it,"
> which supports an inquiry-based framing and gives an instructor something concrete to
> assess.
>
> Grade level: it works from about grade 9 through undergraduate. The scrub-and-observe
> activity needs no prerequisites beyond reading a map; the point-probe-to-CSV activity
> assumes basic spreadsheet or plotting skills.
>
> Data and provenance: all layers are open NASA products (MODIS and Harmonized
> Landsat–Sentinel), every dataset is cited in the app, and every scene displays the
> instrument and acquisition date it came from. Nine scientific layers are available across
> vegetation, temperature, water, cryosphere, and atmosphere.
>
> **Two limitations I would rather state up front than have a reviewer find.** First, the
> point time-series probe reads values back out of rendered colour imagery, so its numbers
> are approximate by design — the app labels this everywhere it appears, and the method and
> its error sources are documented at
> https://github.com/zkWizard/RoamingEye/blob/main/METHODS.md. For teaching, I have found
> that honest limitation to be an asset: it turns into a genuine discussion of measurement
> uncertainty. But it is not a source of publication-grade values, and it should not be
> presented as one. Second, **there is no teacher's guide yet.** The closest things are five
> step-by-step walkthroughs at
> https://github.com/zkWizard/RoamingEye/blob/main/docs/research-recipes.md and a set of
> classroom lesson ideas; if the reviewers think a proper instructor guide is the missing
> piece, I would take that as useful direction and write one.
>
> Practical notes for classrooms: it runs on Chromebooks and school-managed laptops because
> there is nothing to install, and the URL encodes the layer, month, and camera angle — so an
> instructor can send a class one link that opens exactly the scene they set up.
>
> Source and licence: https://github.com/zkWizard/RoamingEye (MIT). Anything here can be
> forked, screenshotted, or rebuilt for a course without asking.

---

## After you submit

1. Flip `Status: DRAFT` → `SENT` above, with the date.
2. Set the CLEAN entry in [`../TARGETS.md`](../TARGETS.md) to `sent-by-user`.
3. Add one line to [`../LOG.md`](../LOG.md).
4. **Save the reviewers' comments when they arrive** — one educator and one scientist read
   this closely, and their notes are the most useful teaching-side feedback the project is
   likely to get. Whatever they flag belongs in the issue tracker.
