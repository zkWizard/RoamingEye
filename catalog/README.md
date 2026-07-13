# RoamingEye software catalog

This directory is the editorial source for RoamingEye's open-source software
finder. Agents may discover and enrich records, but only candidate records with
`"approval": "approved"` are published to `public/data/software-catalog.json`.

`candidates.json` contains reviewed seed candidates. `inbox.json` is the
unreviewed discovery queue. Generated files are committed so the public finder
remains static, fast, and available without an account.

Run the fleet with `npm run agents:run`. Run `npm run catalog:check` before
reviewing a catalog change. The full operating model lives in
`docs/agent-fleet.md`.
