# Draft: EO community Slack / Discord / Pangeo Discourse

(Short by design — chat venues punish walls of text. Adjust the first line
per venue; lead with the link.)

---

Hi all 👋 — sharing an open-source side project that some of you might find
useful for quick-look work: **RoamingEye**, a browser-based 3D Earth over
NASA GIBS.

https://zkwizard.github.io/RoamingEye/

The two features that make it more than a globe:

1. **Scrub the full record** — 9 monthly layers (MODIS vegetation/LST/snow,
   MERRA-2 temp/aerosols back to 1980, GLDAS water), every published month on
   a timeline slider.
2. **Click → CSV** — click any point for a full-record time series with
   provenance headers. It's colormap inversion of the rendered imagery (so
   approximate, and labeled as such) — but for "is there a signal at this
   site worth a real pull?" it's seconds instead of a notebook session.

Also: cloud-aware 30 m HLS study patches, plate boundaries + GVP volcanoes +
live seismicity for the geology folks, and URLs that encode the exact view
for reproducibility.

Static site, no backend, MIT, all open data. Feedback (and contributors —
the tiled-streaming RFC is the fun one) very welcome:
https://github.com/zkWizard/RoamingEye
