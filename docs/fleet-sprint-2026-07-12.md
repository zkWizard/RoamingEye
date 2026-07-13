# RoamingEye Fleet Sprint

## Operating window

Run independently for the next 3-4 hours. Work through the listed tasks in
order, then use remaining time for closely related improvements. Do not merge,
deploy, publish a catalog record, or overwrite another agent's work. Each role
works in its own branch and records checkpoints in the named log file.

## Shared guardrails

- Treat discovery as a lead, never an endorsement.
- Use primary project sources and official repository metadata for factual
  claims.
- Preserve the review gate: only `approval: "approved"` records can reach the
  public catalog.
- Make a small, focused change at a time and run the most relevant checks.
- Record completed work, remaining work, changed files, and validation in the
  role's log before finishing.

## 1. Scout

Owns `catalog/inbox.json` and `docs/fleet-logs/scout.md`.

1. Discover credible open-source tools in underrepresented areas: hydrology,
   ocean science, cryosphere, geology, geodesy, and atmospheric science.
2. Broaden discovery queries while deduplicating against the seed catalog and
   existing inbox.
3. Add only conservative pending leads with repository, discovery source, and
   date. Do not approve or publish a tool.
4. Review the final inbox for duplicates, archives, and obviously off-topic
   projects.

## 2. Verifier

Owns `scripts/agents/verifier.mjs`, verifier-focused tests or fixtures, and
`docs/fleet-logs/verifier.md`.

1. Audit the current review queue for HTTPS repository links, SPDX evidence,
   archival status, and official documentation.
2. Improve the verifier's rate-limit, malformed-response, and stale-evidence
   handling without weakening the review gate.
3. Add focused automated coverage for the new failure modes.
4. Produce a concise evidence-quality summary for records needing human review.

## 3. Workflow Mapper

Owns `scripts/agents/workflow-mapper.mjs`, mapper-focused tests or fixtures,
and `docs/fleet-logs/workflow-mapper.md`.

1. Expand the explainable taxonomy for the newly targeted Earth-science
   domains, formats, and practical research workflows.
2. Keep tags conservative: map only explicit repository signals, never inferred
   scientific capability.
3. Add deterministic mapping tests for each new taxonomy branch.
4. Identify coverage gaps that should become future editorial vocabulary.

## 4. Access Editor

Owns `scripts/agents/access-editor.mjs`, access-editor-focused tests or
fixtures, and `docs/fleet-logs/access-editor.md`.

1. Improve access-path guidance so desktop, Python, command-line, library, and
   web-service tools receive useful, non-speculative next steps.
2. Add validation for unsupported or contradictory access metadata.
3. Make the generated text concise and internationally understandable without
   inventing install commands, pricing, or support guarantees.
4. Document any metadata that must be supplied by a human editor rather than
   guessed by an agent.

## 5. Experience Builder

Owns `src/ui/SoftwareFinder.ts`, `src/lib/softwareCatalog.ts`, their focused
tests, and `docs/fleet-logs/experience-builder.md`.

1. Improve the finder for a researcher comparing tools: clearer empty states,
   stronger filtering and sorting behavior, and more useful provenance at the
   decision point.
2. Keep the interface compact, keyboard accessible, and usable on mobile.
3. Add tests for new data states and user flows.
4. Use only the review-gated static catalog; do not introduce runtime model or
   account dependencies.

## 6. QA / Release

Owns `e2e/`, `playwright.config.ts`, quality-report logic or fixtures, and
`docs/fleet-logs/qa-release.md`.

1. Diagnose and fix the Chromium accessibility run that stalls around the
   probe-panel check, while preserving meaningful coverage.
2. Add a deterministic browser test for exact-boundary place insights that does
   not depend on a live third-party response.
3. Review the release checks for generated catalog data, boundary sampling, and
   mobile layout regressions.
4. Leave a release-readiness summary with passing commands and any remaining
   environmental limitation.
