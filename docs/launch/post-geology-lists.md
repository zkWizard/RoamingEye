# Draft: geology department mailing lists / teaching contacts

```
To:      individual educators (intro geology / geophysics / Earth systems)
Venue:   email — department lists and personal teaching contacts
Channel: direct email, personalised per recipient
Status:  DRAFT — send-gated on HTTPS
Date:    drafted pre-v1.0; claims repaired 2026-07-27
Claims re-verified: 2026-07-27
```

> **Send gate:** the link below points at `https://roamingeye.org/`, which has no
> certificate yet — run the check in
> [`comms/outbox/README.md`](../../comms/outbox/README.md) before sending. This matters
> most for this audience: institutional networks are unforgiving about certificate
> warnings, and an educator who bounces on first click does not come back.
>
> **Companion asset:** for a recipient who asks "what would I actually do with this in
> class?", send the classroom one-pager at
> [`comms/outbox/classroom-lab-one-pager.md`](../../comms/outbox/classroom-lab-one-pager.md)
> — five ready-to-use lesson ideas mapped to real features. This email is the opener;
> that is the follow-up.

(Email framing — aimed at people who teach intro geology, geophysics, or
Earth-systems courses. Personalise the first paragraph per recipient.)

---

**Subject:** A free, browser-based globe for teaching plate tectonics and
Earth-systems change (open source, no accounts)

Hi <name>,

I wanted to share a free teaching resource that might be useful for
<course / intro geology>: **RoamingEye**, an open-source 3D globe built
entirely on open data (NASA GIBS, USGS, Smithsonian GVP).

https://roamingeye.org/

Two things it does well for teaching:

**The plate-tectonics view.** Put ASTER shaded relief on the globe, then
toggle on plate boundaries (Bird 2003), all ~1,200 Holocene volcanoes
(Smithsonian GVP, colored by eruption recency), and the last 30 days of real
M4.5+ earthquakes colored by depth. Subduction zones show the shallow-to-deep
progression directly. Because the URL encodes the exact view, you can paste
one link into your slides or LMS and every student sees precisely the scene
you set up — with this month's actual seismicity.

**Earth changing over time.** A timeline slider scrubs month-by-month through
26 to 46 years of vegetation, snow, and temperature composites, depending on the
layer (the reanalysis layers reach back to 1980) — seasons, droughts, and trends
emerge visually. Students can click any point on the globe and download the time
series as a CSV for a lab exercise; the probe also runs a seasonal Mann-Kendall
trend test with Sen's slope, so a class can go from "it looks like it's changing"
to a stated result with an uncertainty. There are step-by-step "research recipes"
in the docs.

It's MIT-licensed, needs no accounts or installs (any laptop browser works),
and there's nothing to purchase — it exists because the underlying data is
already public. If you try it in a class, I'd genuinely value hearing what
worked and what didn't.

Best,
<signature>
