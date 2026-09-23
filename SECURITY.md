# Security policy

## Supported versions

The latest `main` branch and the latest published release are the supported versions.

## Reporting a vulnerability

Do not open a public issue for a secret, credential, cross-site scripting issue, dependency exploit or other security-sensitive report. Use GitHub’s private security advisory flow for the repository, or contact the maintainer privately through the account profile.

Please include the affected path, reproduction steps, impact and any suggested mitigation. Do not include real provider keys or personal data. Public catalog corrections and normal UI bugs belong in the issue tracker.

The site is a static client-side app. It does not collect provider credentials, proxy API calls, or send workload prompts to a backend.

## Automated dependency checks

Every pull request receives the stable `audit` check, including documentation-only and workflow-only changes. CI audits production and development dependencies, verifies registry signatures and fails on high-severity advisories. Development dependencies are in scope because they execute in local tooling and CI; they are not shipped in the static bundle.

Dependabot version updates remain enabled weekly in [`.github/dependabot.yml`](.github/dependabot.yml). Repository administrators should also keep Dependabot alerts and security updates enabled in the GitHub security settings; those account-level settings are not represented in this repository.

## Browser policy and hosting boundary

The HTML meta CSP restricts scripts, objects and resource origins. GitHub Pages does not let this repository configure response headers. The site therefore does **not** currently enforce anti-framing protection: `frame-ancestors` is ignored in a meta policy and was removed to avoid claiming protection that is not applied.

If anti-framing becomes a deployment requirement, the serving host or reverse proxy must send `Content-Security-Policy: frame-ancestors 'none'` as an HTTP response header (and may send `X-Frame-Options: DENY` for older clients). Verify the actual production response before claiming enforcement. A static `_headers` file or JavaScript frame-busting is not a substitute on GitHub Pages.

Pages deployment runs the reusable CI quality workflow against the same commit before uploading its artifact. This includes dependency auditing, data validation, lint, unit tests and browser tests.
