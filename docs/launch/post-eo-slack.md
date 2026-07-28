# Draft: EO community Slack / Discord / Pangeo Discourse

```
To:      public (EO community Slacks / Discords)
Venue:   chat venues — see note below
Channel: per-venue #showcase / #show-and-tell
Status:  DRAFT — send-gated on HTTPS
Date:    drafted pre-v1.0; claims repaired 2026-07-27
Claims re-verified: 2026-07-27
```

> **Send gate:** the link below points at `https://roamingeye.org/`, which has no
> certificate yet — run the check in
> [`comms/outbox/README.md`](../../comms/outbox/README.md) before sending.
>
> **Pangeo note:** this draft names Pangeo Discourse, but Pangeo now has its own
> dedicated, longer-form Showcase draft at
> [`comms/outbox/pangeo-showcase-roamingeye.md`](../../comms/outbox/pangeo-showcase-roamingeye.md),
> which is tailored to that category's rules. **Use that one for Pangeo**; keep this
> short version for chat venues only.

(Short by design — chat venues punish walls of text. Adjust the first line
per venue; lead with the link.)

---

Hi all 👋 — sharing an open-source side project that some of you might find
useful for quick-look work: **RoamingEye**, a browser-based 3D Earth over
NASA GIBS.

https://roamingeye.org/

The two features that make it more than a globe:

1. **Scrub the full record** — 9 monthly layers (MODIS vegetation/LST/snow,
   MERRA-2 temp/aerosols back to 1980, GLDAS water), every published month on
   a timeline slider.
2. **Click → CSV** — click any point for a full-record time series with
   provenance headers. It's colormap inversion of the rendered imagery (so
   approximate, and labeled as such) — but for "is there a signal at this
   site worth a real pull?" it's seconds instead of a notebook session.

Also: cloud-aware 30 m HLS study patches, plate boundaries + GVP volcanoes +
live seismicity for the geology folks, native-resolution WMTS tile streaming on
by default (so it stays sharp as you zoom), and URLs that encode the exact view
for reproducibility.

Static site, no backend, MIT, all open data. Feedback (and contributors — the
flagship open issue is inverting against GIBS's real colormaps so the probe
returns accurate absolute values) very welcome:
https://github.com/zkWizard/RoamingEye
