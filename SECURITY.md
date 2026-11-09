# Security policy

Selvara is a governance, risk and compliance platform intended for regulated industries, so we take vulnerability reports seriously.

## Reporting a vulnerability

**Email: [security@selvara.com](mailto:security@selvara.com)**

Please do **not** open a public GitHub issue, pull request or discussion for a suspected vulnerability.

Include, where you can:

- A description of the issue and its impact (what an attacker could do)
- The affected route, component or file, and the commit or branch you tested
- Step-by-step reproduction, with a proof of concept if possible
- Any suggested fix or mitigation

Please use synthetic data only. Do not include real personal data, credentials or secrets in your report.

We will acknowledge your report and keep you informed of progress. Please give us reasonable time to investigate and fix an issue before any public disclosure.

## Scope

In scope: the application code in this repository (`front-end/`), its build, CI/CD and release pipeline (`.github/`, see [`docs/PIPELINE.md`](docs/PIPELINE.md)), and its documented security controls. Reports about the pipeline itself (for example a way to deploy without the gates, or to leak a deployment token) are welcome.

Out of scope: social engineering, physical attacks, denial-of-service testing, testing against systems or data you do not own, and findings that only affect unsupported browsers.

## Supported versions

Selvara has not had a stable release yet. Only the default branch (and the branch of any open pull request) receives fixes.

## What to expect from this codebase

The current front-end is a complete application running on synthetic in-memory data. There is no server, database or real authentication yet, so some classes of issue (session handling, server-side authorization, CSRF, rate limiting) cannot be exercised until the backend exists. Known limitations and backend requirements are documented in [`front-end/docs/SECURITY.md`](front-end/docs/SECURITY.md), and the access-control and segregation-of-duties rules in [`front-end/docs/SOD_MATRIX.md`](front-end/docs/SOD_MATRIX.md). Reports that go beyond what is already listed there are especially welcome.
