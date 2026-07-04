# v0.2.0 launch checklist

The ~10 minutes of maintainer-only steps, in order. Everything else (docs,
demo GIF, release notes, post drafts) is already in the repo.

## 1. Merge the feature PRs (bottom of the stack first)

- [ ] #41 plate-tectonics context pack
- [ ] #42 point time-series probe (retargets to `main` automatically)
- [ ] the launch-package PR (this one)
- [ ] the RFC-001 tiling PRs, if you want them in 0.2.0 (they're additive)

## 2. Cut the release

```bash
git checkout main && git pull
git tag v0.2.0 && git push origin v0.2.0
gh release create v0.2.0 --title "v0.2.0 — the research-instrument release" \
  --notes-file docs/launch/release-notes-v0.2.0.md
```

## 3. Mint the Zenodo DOI (one-time setup, ~3 min)

1. Log in at [zenodo.org](https://zenodo.org/) with GitHub.
2. [Settings → GitHub](https://zenodo.org/account/settings/github/) → flip the
   toggle for `zkWizard/RoamingEye`.
3. Zenodo archives the **next** release automatically. If you flipped the
   toggle _after_ step 2, cut `v0.2.1` (or re-publish the release) to trigger it.
4. Copy the **Concept DOI** (the version-independent one) from the Zenodo record.

## 4. Wire the DOI back into the repo

- [ ] Add `doi: 10.xxxx/zenodo.xxxxxxx` to `CITATION.cff`.
- [ ] In `README.md`, replace the "A Zenodo DOI is planned" note with the badge:
      `[![DOI](https://zenodo.org/badge/DOI/10.xxxx/zenodo.xxxxxxx.svg)](https://doi.org/10.xxxx/zenodo.xxxxxxx)`
- [ ] Redeploy the site: `npm run deploy`.

## 5. Post (drafts in this directory — personalise before sending)

- [ ] r/gis — `post-reddit-r-gis.md` (also fits r/remotesensing; stagger by a
      few days rather than cross-posting the same hour)
- [ ] Earth-observation Slack/Discord groups — `post-eo-slack.md` (Pangeo
      Discourse, EO community Slacks you're in; adjust the intro line per venue)
- [ ] Geology department mailing lists — `post-geology-lists.md` (send to
      contacts who teach intro geology / geophysics; it's framed for teaching)

## 6. Afterwards

- [ ] Pin the "good first issue" tracking issues (created at launch) and watch
      for first-time contributors while the posts are fresh.
- [ ] Note anything that confused first users → issues. Those are the next
      round of polish.
