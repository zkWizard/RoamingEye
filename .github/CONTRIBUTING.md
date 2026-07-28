# Contributing to RoamingEye

First off — thank you. RoamingEye is an open, community-built project, and
contributions of every size are welcome, from a one-character typo fix to a new
rendering subsystem. This guide explains how to get set up, how we review
changes, and what's expected of a PR.

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).
For how decisions get made and how trust is earned, see [GOVERNANCE.md](../GOVERNANCE.md).

---

## Ways to contribute

You don't have to write code to help:

- **Report bugs** and **suggest features** via [issues](https://github.com/zkWizard/RoamingEye/issues).
- **Review pull requests** — anyone can review, and thoughtful community review
  counts toward a PR's approval (see _Review process_ below).
- **Improve docs, tests, or examples.**
- **Write code** — fix a bug or build a feature.

Look for issues labelled [`good first issue`](https://github.com/zkWizard/RoamingEye/labels/good%20first%20issue)
to get started.

Before picking something in `src/lib/`, read
[**Wired vs. staged modules**](../ARCHITECTURE.md#wired-vs-staged-modules--read-this-before-picking-a-task)
in the architecture guide — most modules there are tested but not yet connected
to the app, so editing one won't change what a user sees. Connecting one is a
great first project.

---

## Development setup

**Requirements:** [Node.js](https://nodejs.org/) 20+ and npm.

```bash
# Fork the repo on GitHub, then clone your fork:
git clone https://github.com/<your-username>/RoamingEye.git
cd RoamingEye

npm install        # install dependencies
npm run dev        # start the local dev server (http://localhost:5173)
```

### Useful scripts

| Script                | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `npm run dev`         | Start the Vite dev server with hot reload                       |
| `npm run build`       | Type-check (`tsc`) **and** build the production bundle          |
| `npm run typecheck`   | Type-check only (Vite does **not** type-check on build)         |
| `npm run lint`        | Run ESLint                                                      |
| `npm run format`      | Auto-format with Prettier                                       |
| `npm run test`        | Run unit tests (Vitest)                                         |
| `npm run test:e2e`    | Run the Playwright browser smoke tests                          |
| `npm run verify`      | All CI checks except e2e (typecheck, lint, format, unit, build) |
| `npm run verify:full` | `verify` plus the Playwright e2e suite — the full CI mirror     |

Before opening a PR, please run **`npm run verify`** locally — these are the
same checks CI runs. Every PR then runs the full suite on GitHub Actions
(`.github/workflows/ci.yml` — type-check, lint/format, unit, build, plus CodeQL,
OpenSSF Scorecard, and the WebGL e2e smoke tests); a maintainer merges once it's
approved and the required checks are green.

A red **E2E smoke (WebGL)** check is sometimes flaky rather than a real failure —
if it fails and your change doesn't touch rendering, say so in the PR and a
maintainer will re-run it.

### The bundle budget — read this before adding code to the app

The **Build** check does more than compile. It also runs
[`scripts/check-bundle-size.mjs`](../scripts/check-bundle-size.mjs), which fails
the build if the app's JavaScript chunk exceeds **60 kB gzipped** (the separate
`three-*` vendor chunk has its own, roomier 170 kB budget). `npm run build` runs
that same check locally, so you can see the verdict before you push:

```text
ok  index-CDzPGmQE.js: 60.0 kB gzip (budget 60 kB)
ok  three-eDZqjHhA.js: 133.3 kB gzip (budget 170 kB)
     total JS: 193.3 kB gzip
```

**The app chunk is currently sitting on its cap.** That is real output from CI on
`main` at `156822f` (2026-07-28) — 60.0 kB against a budget of 60, i.e. well
under a tenth of a kB of headroom. If your PR adds code the app actually
imports, expect Build to go red on the budget, and please read that as a
repo-wide condition rather than a mistake in your patch.

Two things make the result easy to misread:

- **The size looks the same either way.** At this margin a chunk that is _over_
  budget still prints `60.0 kB`; only the leading word changes. Read the `ok` /
  `FAIL` at the start of the line, not the number after it.
- **Only wired code counts.** A module nothing imports is tree-shaken out of the
  bundle and costs zero bytes — which is how `src/lib/` keeps growing while the
  budget barely moves. The bytes land at the moment the module gets a call site
  (see [Wired vs. staged modules](../ARCHITECTURE.md#wired-vs-staged-modules--read-this-before-picking-a-task)).

If you do hit the cap, **say so in the PR and leave it there** — please don't
raise the number in `check-bundle-size.mjs` to get to green. Whether to trim
elsewhere, split the chunk, or deliberately spend more budget is a maintainer
call, and the script's own rule is that a budget bump must be justified by the
PR that makes it.

### Work that costs no budget

The budget check only ever reads the **`.js` chunks** in `dist/assets`. Four
kinds of change are therefore unaffected by it entirely, and all four are real
contributions rather than consolation prizes:

- **Docs** — anything in `docs/`, `README.md`, or this file.
- **Build and tooling** — `scripts/`, CI workflows, config. Not part of the app
  bundle at all.
- **End-to-end tests** — `e2e/`. Playwright specs are never imported by `src/`,
  so they add nothing to the bundle. This is also where behaviour in a real
  browser gets covered, which is the kind of test this project leans on most.
- **CSS** — `src/style.css` is emitted as its own `.css` asset (a separate file
  from the `.js` the check measures), so styling, layout, and theming work is
  unbudgeted. Plenty of visible polish lives here.

**One thing that is _not_ a way around the cap: adding unit tests to the files
that don't have them.** That looks like free, useful work, and it isn't — the
gap is deliberate. `src/lib/` and `src/probe/` are already covered (every module
there is imported by at least one test). What's left uncovered is `src/ui/`,
`src/overlays/`, `src/scene/`, `src/textures/`, and `src/main.ts` — all DOM and
rendering code, which Vitest here runs `environment: "node"` for and so cannot
touch without a DOM. Covering them means changing the test environment, which is
an architectural decision rather than a starter task; see _Testing_ below for
what is and isn't worth unit-testing in a WebGL app. Reach for `e2e/` instead.

---

## The contribution workflow

1. **Open or find an issue** describing the change. For anything non-trivial,
   discuss the approach _before_ writing a lot of code (see _Scaling review to
   the change_ below) — it avoids wasted work.
2. **Create a branch** off `main` in your fork (e.g. `feat/zoom-controls` or
   `fix/texture-loading`).
3. **Make your change**, keeping it focused — one logical change per PR. Match
   the style of the surrounding code.
4. **Add or update tests** where it makes sense (see _Testing_ below).
5. **Sign off your commits** — see _Developer Certificate of Origin_ below.
6. **Open a pull request** against `main`. Fill out the PR template. Mark it as a
   **draft** if it isn't ready for review yet.
7. **Respond to review feedback.** Once approved and all checks are green, a
   maintainer will merge it.

`main` is protected: all changes land through reviewed pull requests.

---

## Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/) —
a lightweight, no-paperwork alternative to a CLA. It's a one-line attestation
that you have the right to submit the code you're contributing.

To sign off, add the `-s` flag when you commit:

```bash
git commit -s -m "Add zoom controls"
```

This appends a `Signed-off-by: Your Name <your@email.com>` trailer to the commit
message. Every commit in a PR must be signed off; an automated check enforces it.
If you forget, you can fix the last commit with `git commit --amend -s` (or
`git rebase --signoff main` for a whole branch).

---

## Testing

We gate every PR on an automated suite. Here's what's worth testing — and what
isn't — in a WebGL app:

**Do unit-test (Vitest):** pure logic with no rendering dependency — coordinate
math (lat/long ↔ 3D), distances, interpolation, data parsing, state logic. See
[`src/lib/geo.test.ts`](../src/lib/geo.test.ts) for the pattern. Extract logic
into pure functions so it's testable.

**Don't unit-test:** actual GPU rendering, shader output, or how a material
looks — there's no meaningful "unit" and no GPU in the test runner. Those are
covered by the **e2e smoke tests** ([`e2e/`](../e2e/)), which assert the things
that actually break a 3D app: the page loads, a sized `<canvas>` exists, a WebGL
context is acquired, and nothing throws to the console.

> **Note on WebGL in CI:** browsers in CI have no real GPU and fall back to
> software rendering (SwiftShader), which is slower and pixel-different from real
> hardware. That's why our e2e tests assert _behavior_ (context acquired, no
> errors), not _pixels_.

**Visual regression (advisory).** The scientific chrome — legends, timeline,
picker, toolbar, modals — is screenshot-tested in
[`e2e/visual.spec.ts`](../e2e/visual.spec.ts), run by the `visual` CI job
(`continue-on-error`: a diff posts a report artifact but never blocks a
merge). The WebGL canvas is hidden during shots and the timeline is frozen,
so only deliberate UI changes should ever diff. **Baselines are Linux (CI)
renders** — don't regenerate them locally. When your PR intentionally changes
the UI: run the **"Update visual baselines"** workflow from the Actions tab
against your branch, download the `visual-baselines` artifact, and commit its
contents to `e2e/__screenshots__/`.

---

## Scaling review to the change

Not every change needs the same rigor — but **every change gets reviewed.** We
roughly scale review depth to the size and risk of the change:

- **Trivial** (typo, doc tweak, one-liner): one maintainer approval.
- **Standard** (bug fix, contained feature): review from a maintainer or area
  code owner; tests expected.
- **Substantial / architectural** (new subsystem, coordinate-system or data-pipeline
  changes, anything affecting many areas or hard to reverse): please open a
  **design proposal issue first** so the approach can be agreed before
  implementation. Larger changes need sign-off from the relevant area owner.

When in doubt, open an issue and ask — we'd rather align early.

---

## Code style

- **TypeScript**, strict mode. Prefer pure functions for logic; keep rendering
  code separate from data/math.
- **ESLint + Prettier** enforce style — run `npm run format` before committing
  and let the tools settle formatting debates.
- Write code that reads like the code around it.

---

## Licensing of contributions

RoamingEye is [MIT licensed](../LICENSE). By contributing (and signing off via
the DCO), you agree your contributions are licensed under the same terms.
Imagery and geospatial data retain their own licenses — if you add a new data
source, document its license and attribution in the README.

Thanks again for helping build RoamingEye! 🌍
