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

`.github/workflows/agent-fleet.yml` runs daily at 05:23 UTC and on demand.
The catalog job has `contents: write` so it can force-push
`agents/catalog-refresh`, and `pull-requests: write` so it can open a signed
**draft** pull request. It never pushes to `main`.

Status, history, QA, and review-queue files re-stamp on every run. The
workflow opens a review only when `catalog/inbox.json`,
`catalog/verified-tools.json`, `catalog/mapped-tools.json`, or
`catalog/edited-tools.json` changed. It commits those curated records, then
force-pushes `agents/catalog-refresh`.

If an open pull request for that branch already exists, the push updates it
and the job stops there. Otherwise the workflow opens a draft pull request.

Opening a pull request needs a token this repository allows to create one.
Set the Actions secret `CATALOG_FLEET_TOKEN` to either of these:

- A fine-grained personal access token for this repository, with pull
  requests read and write. This is the durable choice. Contents access can
  stay read-only, because the workflow token still does the git push.
- A GitHub App installation token with the same pull request access.
  Installation tokens expire after one hour, so a token stored once will
  stop working before the next daily run.

When `CATALOG_FLEET_TOKEN` is unset, the workflow tries the default
`GITHUB_TOKEN`. That call succeeds when the repository allows GitHub Actions
to create and approve pull requests (Settings > Actions > General). With
that setting off, GitHub refuses the default token. The job then stays
green: it prints a warning and writes this compare link to the job summary,
so a person can open the pull request in one step. The next run updates
that pull request.

<https://github.com/zkWizard/RoamingEye/compare/main...agents/catalog-refresh>

A configured token that fails for any other reason still fails the job.

All generated text is rendered as DOM text, not HTML, and all catalog records
remain committed, inspectable static data.

The Scout's GitHub search is intentionally broad. Discovery is a lead, not an
endorsement. Scientific relevance, accessibility claims, licensing details,
and inclusion remain human editorial decisions.
