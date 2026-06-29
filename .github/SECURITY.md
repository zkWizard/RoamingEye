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

## Supported versions

The project is pre-1.0 and moving fast. Only the latest `main` is supported; fixes
land there and flow into the next release.
