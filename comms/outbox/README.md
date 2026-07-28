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

**Re-measured later on 2026-07-27 — unchanged, and no cert has appeared:**
`https_certificate` is still `null`, `https_enforced` still `false`, and
`https://roamingeye.org/` does not merely warn — `curl` returns status `000` and exits
non-zero, i.e. **the connection never completes**. `zkwizard.github.io/RoamingEye/` still
`301`s to plain `http://`. The gate stands.

### Third measurement, 2026-07-27 — DNS is correct; this is a waiting game, not a misconfiguration

Earlier notes left it open whether something was set up wrong. It is not. Every record
GitHub Pages needs is in place, so **do not change DNS, the `CNAME` file, or the custom
domain to try to force the certificate** — that would restart verification and make the
wait longer.

| Check                    | Value                                      | Verdict |
| ------------------------ | ------------------------------------------ | ------- |
| apex `A`                 | `185.199.108–111.153` (all four)           | correct |
| apex `AAAA`              | `2606:50c0:8000–8003::153`                 | correct |
| `www.roamingeye.org`     | `CNAME` → `zkwizard.github.io`             | correct |
| `CAA`                    | none published (nothing blocking issuance) | correct |
| `protected_domain_state` | `verified`                                 | correct |
| `https_certificate`      | `null`                                     | pending |

The domain moved to `roamingeye.org` today, and GitHub issues the certificate
automatically after verification — usually well within ~24h. The single remaining action
is to wait, then flip **Enforce HTTPS**.

**Two consequences of the plain-HTTP window that were not previously recorded:**

1. **A shipped feature is silently broken on the live site.** The v1.1.0 "You are here"
   geolocation pin needs a secure context. Measured in a real browser on
   `http://roamingeye.org/`: `window.isSecureContext` is `false`, and
   `navigator.geolocation.getCurrentPosition` fails immediately with error code `1` and
   the browser's own message — _"Only secure origins are allowed."_ The app degrades
   politely (the toggle reverts and toasts), so it looks like a denied permission rather
   than a broken site, but the feature cannot work for anyone until HTTPS is on. Worth
   knowing before demoing the app to anybody this week.
2. **The public health check is red.** `.github/workflows/health-check.yml` monitors
   `https://roamingeye.org/`, so it failed on 2026-07-27 after seven consecutive daily
   successes. A red workflow on the Actions tab is a credibility signal for exactly the
   contributors we are trying to attract. It should go green on its own once the
   certificate lands — no workflow change needed, and none should be made to mask it.

**Deliberately NOT done, so nobody redoes it:** the dead `https://roamingeye.org/` link
also appears in `README.md` (the front-door "Live" link), `docs/research-recipes.md`,
`index.html` (`og:url` / `og:image`) and the health-check workflow. Rewriting those to
`http://` was considered and rejected — the certificate is provisioning normally, so the
churn would need reverting within a day and risks leaving a plain-HTTP link in the README
permanently. Revisit **only** if the certificate is still `null` after ~48h
(i.e. from 2026-07-29), which would suggest issuance genuinely stalled.

### While you are blocked: one thing that _is_ safe to do now

The repo's one-line **description is empty** (`"description": null`). That is plain text,
touches no link, and is therefore independent of this gate — it shows in GitHub search,
the repo card, and social/OG previews. Suggested text and the exact command are in
`../TARGETS.md` ("Repo discoverability").

**Do not also change the repo `homepage` field yet.** Pointing it at
`https://roamingeye.org/` while the certificate is missing replaces a link that currently
works (`301` → the app) with one a browser cannot open at all. The homepage flip belongs
_after_ the two commands above pass — see the corrected sequence in `../TARGETS.md`.

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
- `clean-collection-submission.md` — CLEAN (`cleanet.org`) _Suggest a Teaching Resource_ form, filled field-by-field; sanctioned developer self-submission to a peer-reviewed educator collection. **DRAFT.**

## Also sendable — four drafts that live outside this directory

`docs/launch/` predates this workspace and holds four outreach drafts that were never
indexed anywhere. They are real, current, and subject to the same send gate above; their
claims were audited and repaired on 2026-07-27. Full index and the drift table:
[`docs/launch/README.md`](../../docs/launch/README.md).

- `../../docs/launch/post-reddit-r-gis.md` — r/gis + r/remotesensing. **DRAFT — also blocked on reading each sub's self-promotion rules** (see `../TARGETS.md`).
- `../../docs/launch/post-eo-slack.md` — short post for EO Slacks/Discords. **DRAFT.** (For Pangeo, use `pangeo-showcase-roamingeye.md` here instead.)
- `../../docs/launch/post-geology-lists.md` — email to geology/Earth-systems teaching contacts. **DRAFT.** (Pairs with `classroom-lab-one-pager.md` as the follow-up.)
- `../../docs/launch/maintainer-comment-template.md` — reusable 3-sentence "what is this?" reply for live threads. **Response asset, not a post.**
