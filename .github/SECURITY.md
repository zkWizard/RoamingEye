# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the [**Security** tab](https://github.com/zkWizard/RoamingEye/security) of this repository.
2. Click **Report a vulnerability**.
3. Provide as much detail as you can — affected component, steps to reproduce, and impact.

You can expect an initial acknowledgement within **7 days**. We'll keep you
updated as we investigate and work on a fix, and we'll credit you when the fix
ships (unless you'd prefer to remain anonymous).

## Scope

RoamingEye is a client-side web application. The most relevant categories are:

- Cross-site scripting (XSS) or injection via the app or any data it loads.
- Supply-chain issues in our dependencies or CI/CD pipeline.
- Anything that could compromise a contributor's machine via the build or test
  tooling.

## Automated scanning

These automated layers run on every pull request and push to `main`:

- **CodeQL** (`.github/workflows/codeql.yml`) statically analyses our own
  TypeScript with GitHub's `security-and-quality` suite, plus a weekly
  re-scan so newly published queries cover unchanged code. Alerts land in
  this repository's [Security tab](https://github.com/zkWizard/RoamingEye/security/code-scanning).
- **`npm audit`** (in `ci.yml`) fails CI on high/critical advisories in our
  dependency tree, and Dependabot keeps dependencies current.
- **Supply-chain gates** (in `ci.yml`): `lockfile-lint` rejects any lockfile
  entry that doesn't resolve to `registry.npmjs.org` over HTTPS with an
  integrity hash, and a license allowlist enforces the "100% open" claim —
  strictly permissive for shipped code, permissive + weak-copyleft for dev
  tooling.

## Supported versions

Only the latest release and `main` are supported; fixes land on `main` and
flow into the next release.
