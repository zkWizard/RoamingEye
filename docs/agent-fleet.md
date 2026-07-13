# Catalog agent fleet

RoamingEye's software finder is maintained by six small, review-gated agents.
They create evidence and draft changes; people decide what becomes public.
The site continues to serve a static catalog, with no account, telemetry, or
runtime model dependency.

## Roles and handoffs

1. **Scout** queries GitHub's public repository search and writes unfamiliar
   projects to `catalog/inbox.json` with `approval: "pending"`.
2. **Verifier** checks repository identity, archived status, and GitHub's SPDX
   license evidence. It writes the audit trail to `catalog/review-queue.json`.
3. **Workflow Mapper** adds conservative domain and workflow tags from explicit
   editorial tags and repository signals.
4. **Access Editor** adds access-path guidance without inventing installation
   commands or support promises.
5. **Experience Builder** compiles only `approval: "approved"` entries into
   `public/data/software-catalog.json`.
6. **QA/Release** validates the exact public JSON, reports any breach in
   `catalog/quality-report.json`, and blocks the draft PR.

```text
Scout -> inbox -> Verifier -> review queue -> human approval
      -> Workflow Mapper -> Access Editor -> Experience Builder -> QA -> draft PR
```

An unreviewed discovery can never reach the public finder. A record without
HTTPS repository and documentation links, SPDX evidence, a verification date,
or access metadata also fails QA.

## Editorial workflow

Open **Fleet status** from the RoamingEye header to see the latest six-agent
run and a rolling history of the most recent 12 runs. It is a read-only view of
the committed artifacts. Use the
[Catalog Operations project template](agent-project-template.md) to create the
GitHub Project where people assign, discuss, and approve queue items.

Review `catalog/review-queue.json`, then move a candidate into
`catalog/candidates.json` with `"approval": "approved"`. Add the task,
format, platform, access, and documentation fields from primary project
sources. Run:

```bash
npm run agents:run
npm run verify
```

`GITHUB_TOKEN` is optional locally and lets the agents use GitHub's higher API
rate limit. Set `AGENT_OFFLINE=1` to exercise the enrichment and publication
steps from cached records without making network calls.

## Automation and safety

`.github/workflows/agent-fleet.yml` runs weekly and on demand. It gives the
catalog job narrowly scoped `contents: write` and `pull-requests: write`
permissions solely to create a signed, **draft** PR. It never pushes to `main`.
All generated text is rendered as DOM text, not HTML, and all catalog records
remain committed, inspectable static data.

The Scout's GitHub search is intentionally broad. Discovery is a lead, not an
endorsement. Scientific relevance, accessibility claims, licensing details,
and inclusion remain human editorial decisions.
