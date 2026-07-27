# Outbox

Ready-to-send communication drafts, one file per draft:
`<venue-or-person>-<topic>.md`.

Each file starts with a header block, then the exact text to send:

```
To:      <recipient or "public">
Venue:   <community / platform>
Channel: <category / thread / PR / email>
Status:  DRAFT | APPROVED | SENT
Date:    <YYYY-MM-DD>
---
<the exact, ready-to-send text, tailored to the venue's tone and rules>
```

**Nothing here is ever sent automatically.** These are drafts for zkWizard to review
and personally post. When you send one, flip its `Status` to `SENT`.

## ⛔ SEND GATE — HTTPS is not working yet (verified 2026-07-27)

**Do not send any draft in this directory until the check below passes.** Every draft
links to `https://roamingeye.org/`, and that URL currently fails TLS verification:
GitHub Pages has verified the domain but **has not issued a certificate for it yet**.

Measured 2026-07-27:

| URL                                      | Result                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `https://roamingeye.org/`                | **TLS error** — serves GitHub's default `*.github.io` cert, so the hostname does not match |
| `http://roamingeye.org/`                 | `200` — serves the app, but over plain HTTP                                                |
| `https://zkwizard.github.io/RoamingEye/` | `301` → `http://roamingeye.org/` — an HTTPS→HTTP **downgrade**                             |

Right now there is **no URL that reaches RoamingEye over working HTTPS.** The GitHub
Pages API agrees — `gh api repos/zkWizard/RoamingEye/pages` reports
`"https_certificate": null`, `"https_enforced": false`, and its own `html_url` is
`http://roamingeye.org/`.

This matters more for this audience than most: researchers and students often browse
from institutional networks, and a certificate warning (or a plain-HTTP page) on first
click is a hard bounce. It is worse than not posting. An awesome-list entry is
permanent, and a Show HN gets one shot.

**Clear the gate:**

```bash
gh api repos/zkWizard/RoamingEye/pages --jq '{https_enforced, cert: .https_certificate.state}'
curl -sS -o /dev/null -w '%{http_code}\n' https://roamingeye.org/
```

Send only when the cert state is `approved`, `https_enforced` is `true`, and the `curl`
returns `200` with no TLS error. Certificate issuance is automatic after DNS verification
but can take up to ~24h; once it lands, turn on **Enforce HTTPS** in
_Settings → Pages_ (that is also what flips the `github.io` redirect from `http://` to
`https://`). No draft text needs to change — the URL in them is already correct.

## Before you send any draft

Drafts age. RoamingEye ships continuously, so re-check these three things against the
repo right before posting — each draft carries a `Claims re-verified:` line saying when
this was last done:

1. **The live URL.** Canonical is **`https://roamingeye.org/`** (custom domain since
   2026-07-27). The old `zkwizard.github.io/RoamingEye/` link only redirects — it is wrong
   in a Show HN submission and permanently wrong in an awesome-list entry. **Confirm it
   actually loads over HTTPS first — see the send gate above; as of 2026-07-27 it does
   not.**
2. **The feature and layer claims** — re-skim `README.md`; the layer count, resolution, and
   record lengths quoted in the drafts must match what the app does today.
3. **The venue's own rules** — re-read them at post time; forum policies change.

## Drafts

- `pangeo-showcase-roamingeye.md` — Pangeo Discourse (_Pangeo Showcase_ category). **DRAFT.**
- `hacker-news-show-hn.md` — Hacker News (_Show HN_), title + first comment. **DRAFT.**
- `threejs-showcase-roamingeye.md` — three.js forum (_Showcase_ category), rendering-first post. **DRAFT.**
- `awesome-open-geoscience-pr.md` — Awesome Open Geoscience (SWUNG), ready-to-submit PR entry + body. **DRAFT.**
- `awesome-earthobservation-code-pr.md` — Awesome Earth Observation Code, ready-to-submit PR entry + body. **DRAFT.**
- `classroom-lab-one-pager.md` — reusable classroom/lab one-pager (handout, course page, or educator email). **DRAFT.**
- `leafmap-interop-invitation.md` — leafmap (`opengeos`) GitHub _Discussions → Ideas_, contributor/interop outreach. **DRAFT.**
