To: earthdata-support@nasa.gov (GIBS / ESDIS team)
Venue: NASA Earthdata — GIBS / Worldview / ESDIS
Channel: Email to earthdata-support@nasa.gov (the GIBS "Contact Us" page's recommended path for suggestions/questions). Alternative for the technical colormap question: the Earthdata Forum (https://forum.earthdata.nasa.gov/, GIBS subforum) — expert-reviewed. Do NOT file it as an issue on the nasa-gibs GitHub repos; email/forum is the appropriate first contact.
Status: DRAFT
Date: 2026-07-15

---

**Subject:** Open-source browser globe built on GIBS — a colormap question, and a thank-you

Hello GIBS / ESDIS team,

I maintain **RoamingEye**, a free, open-source (MIT) browser-based 3D globe for exploring the open satellite record. It streams its imagery directly from **GIBS WMTS**, and I wanted to do two things: say thank you, and ask one technical question where your guidance would make the tool measurably more accurate.

- **Live (no account, no install, no fee):** https://zkwizard.github.io/RoamingEye/
- **Code:** https://github.com/zkWizard/RoamingEye

**How we use GIBS.** RoamingEye renders GIBS tiles for nine open products across vegetation, temperature, water, cryosphere, and atmosphere, with a temporal scrubber over the multi-decadal record. GIBS is cited in-app and in our README, and imagery is attributed to NASA EOSDIS GIBS throughout. It's aimed at researchers, educators, students, and journalists who want to eyeball a place and a time window before pulling the actual granules — a friendlier front porch onto data your teams already publish.

**The question.** RoamingEye has a point time-series probe: click anywhere and it charts a layer across its record and exports a provenance-stamped CSV. Today that probe reads the value back out of the _rendered_ RGB by inverting the colormap we apply on our side — which is approximate, and we label it as such everywhere it matters. We'd like to make it citable for absolute values by inverting against **the authoritative GIBS colormap for each layer** instead of our own rendering (this is our top open issue, [#170](https://github.com/zkWizard/RoamingEye/issues/170)). Concretely:

1. What is the canonical, machine-readable source for a given WMTS layer's current colormap — the colormap resources referenced from the WMTS `GetCapabilities` / the published GIBS colormap files? We want to key off the _official_ legend, not reproduce it by hand.
2. Is there a recommended way to know when a layer's colormap or value range changes over time, so a cached inversion doesn't silently drift?
3. Are there layers where a pixel-to-value inversion is simply not advisable (discrete/classified products, log or non-linear scales) that we should flag or exclude rather than pretend to invert?

Any pointer — even just "read this doc" — would help us get this right and avoid overstating accuracy.

**A softer, no-pressure note.** If GIBS or Worldview ever keeps a list of community tools that build on the service, we'd be glad to be considered, but only if it's a genuine fit — the technical question above is the real reason I'm writing. Either way, thank you for making planetary-scale imagery open and easy to build on; RoamingEye simply wouldn't exist without GIBS.

Happy to share anything useful about how the tool is used, and glad to hear if any of the above is off-base.

With appreciation,
zkWizard
RoamingEye — https://github.com/zkWizard/RoamingEye
