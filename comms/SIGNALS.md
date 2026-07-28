# Traction Signals — baseline & how to read them

What the outside world is actually doing with RoamingEye, measured rather than assumed.

This file exists because comms claims must be true. The project's own numbers are the ones
most likely to end up in a draft ("used by…", "cloned N times"), and one of them —
**clone counts** — is badly misleading here. Read the traps below before quoting anything.

**Rule: no number from this file goes into an outreach draft unless this file marks it
quotable.** Right now, none of them are.

---

## Baseline — 2026-07-28 (first full measurement)

GitHub's traffic API only retains a rolling **14 days**, so this is the window
2026-07-13 → 2026-07-26. Nothing has been sent yet (the whole outbox is send-blocked
behind the HTTPS gate), so this is the true _pre-outreach zero point_.

| Signal                        |                              Value | Quotable?    |
| ----------------------------- | ---------------------------------: | ------------ |
| Stars                         |                                  1 | ❌ (trap 2)  |
| Forks                         |                                  0 | —            |
| External watchers             |                                  0 | —            |
| Repo views (14 d)             |                43 total, 10 unique | ❌ too small |
| Clones (14 d)                 |           11,941 total, 503 unique | ❌ (trap 1)  |
| Referrers                     | `github.com` only (23 / 2 uniques) | —            |
| Outside-authored issues + PRs | 0 (excluding dependabot / actions) | —            |

**Daily views** — the honest picture:

```
07-13  22    07-17   1    07-21   0    07-25   0
07-14  15    07-18   1    07-22   0    07-26   0
07-15   1    07-19   0    07-23   0
07-16   1    07-20   2    07-24   0
```

**Zero views on seven of the last eight days.** The 07-13/07-14 bump coincides with the
only star (07-14). Top paths were `/pulls` (21 views, 1 unique — almost certainly the
maintainer watching the PR queue) and the repo landing page (17 views, 10 uniques).

**Interpretation: the project is pre-traction with effectively no external audience.**
That is the expected result, not a failure — _nothing has been sent yet_. It is recorded
so the post-send lift is measurable against a real number instead of a vibe.

---

## Trap 1 — clone counts are meaningless here. Do not cite them.

11,941 clones from 503 unique cloners, against 10 unique _viewers_ and 1 star. Humans
overwhelmingly view a repo before cloning it, so a 50× clone-to-view ratio is not an
audience. The shape gives it away — a burst that stopped dead:

```
07-13  4357     07-17    19     07-22    15
07-14  4088     07-18    17     07-23    13
07-15  2028     07-19    17     07-24    13
07-16  1230     07-20    82     07-25    29
                07-21    19     07-26    14
```

11,703 of the 11,941 (98%) fall in the four days 07-13 → 07-16, then it collapses to
~15/day.

**The cause is not established** and this file will not guess one. Candidates worth
knowing about: automated mirrors and archiving/scraper services (a very common pattern on
public repos), or this project's own infrastructure — the 7-specialist agent fleet and the
merge train, which produced **1,213 workflow runs** in the same 14 days.

What matters is the decision, and it does not depend on the cause: **a number this
disconnected from views and stars is not evidence of adoption, and quoting it — in a Show
HN comment, an awesome-list PR, a JOSS submission, or anywhere else — would be an
unsupportable claim.** JOSS in particular weighs real external usage; inflating it with
clone counts would be exactly the wrong move.

## Trap 2 — "1 star" is not one interested user

The single stargazer is **`statuette`** (starred 2026-07-14): bio `cryptostatuette.eth`,
1 public repo, 1 follower, no earth-science, GIS, or remote-sensing signal anywhere on the
profile. This reads as a drive-by star, not an evaluator.

Two consequences:

- **True external interest is 0, not 1.** Prior LOG entries carried "1 star" forward as a
  faint positive; it isn't one.
- **Duty 3's stargazer track is closed, not pending.** The pipeline has been waiting for
  someone to invite from the stargazer list. There is nobody there — `statuette` is not a
  plausible contributor and should not be sent a personalized invitation. Re-open this
  track only when a star arrives from an account with relevant public work.

---

## What a real signal will look like

After the first sends land, these are the movements that would actually mean something —
listed so the next measurement is a comparison, not a re-derivation:

- **Referrers diversifying** beyond `github.com` — `news.ycombinator.com`,
  `discourse.pangeo.io`, `reddit.com`, `mastodon.*`. This is the single clearest
  attribution signal for which draft worked.
- **Unique views** moving from ~10/14 d into the hundreds, with the landing page and
  `README.md` as top paths.
- **Provenance-checking behaviour**: views on `METHODS.md`, `DATA_SOURCES.md`,
  `CITATION.cff`. One unique visitor hit each of those in this window — that is the
  fingerprint of a careful evaluator, and it is the audience the project is built for.
- **Forks, and issues or PRs authored by anyone other than the maintainer** — the only
  hard evidence of contributors, and currently 0.

## How to re-measure

```bash
gh api repos/zkWizard/RoamingEye --jq '{stars:.stargazers_count,forks:.forks_count,watchers:.subscribers_count}'
gh api repos/zkWizard/RoamingEye/traffic/views  --jq '.views[]|"\(.timestamp[0:10]) \(.count) \(.uniques)"'
gh api repos/zkWizard/RoamingEye/traffic/clones --jq '.clones[]|"\(.timestamp[0:10]) \(.count) \(.uniques)"'
gh api repos/zkWizard/RoamingEye/traffic/popular/referrers
gh api repos/zkWizard/RoamingEye/traffic/popular/paths --jq '.[]|"\(.count)\t\(.uniques)\t\(.path)"'
```

⚠️ **The 14-day window is a hard retention limit — GitHub keeps no history.** If nobody
re-measures for a fortnight, the response to the first outreach wave is _permanently
unrecoverable_. Append a dated block to this file on any run that measures, and measure on
the run immediately after zkWizard reports sending anything.
