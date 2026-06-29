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

| Script              | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `npm run dev`       | Start the Vite dev server with hot reload               |
| `npm run build`     | Type-check (`tsc`) **and** build the production bundle  |
| `npm run typecheck` | Type-check only (Vite does **not** type-check on build) |
| `npm run lint`      | Run ESLint                                              |
| `npm run format`    | Auto-format with Prettier                               |
| `npm run test`      | Run unit tests (Vitest)                                 |
| `npm run test:e2e`  | Run the Playwright browser smoke tests                  |

Before opening a PR, please run **`npm run lint && npm run typecheck && npm run test && npm run build`**
locally — these are the same checks CI will run.

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
> errors), not _pixels_. Visual-regression (screenshot) testing is on the
> roadmap and will start out non-blocking.

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
