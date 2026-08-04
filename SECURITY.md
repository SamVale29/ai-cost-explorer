# Security policy

## Supported versions

The latest `main` branch and the latest published release are the supported versions.

## Reporting a vulnerability

Do not open a public issue for a secret, credential, cross-site scripting issue, dependency exploit or other security-sensitive report. Use GitHub’s private security advisory flow for the repository, or contact the maintainer privately through the account profile.

Please include the affected path, reproduction steps, impact and any suggested mitigation. Do not include real provider keys or personal data. Public catalog corrections and normal UI bugs belong in the issue tracker.

The site is a static client-side app. It does not collect provider credentials, proxy API calls, or send workload prompts to a backend.

## Automated dependency checks

CI audits production dependencies and verifies registry signatures. The current audit exception for `GHSA-qwww-vcr4-c8h2` is limited to React Router's unstable RSC APIs; this repository uses declarative `BrowserRouter`/`Routes` only and has no RSC runtime. Review this exception by **2026-09-01**, then remove it when the deployed dependency line is upgraded to a release that includes the RSC fix, or if the application adopts RSC APIs.
