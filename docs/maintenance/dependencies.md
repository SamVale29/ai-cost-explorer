# Dependency maintenance decisions

## TypeScript 7 major update

- Decision date: 2026-09-20
- Status: deferred
- Reference: Dependabot PR [#19](https://github.com/SamVale29/ai-cost-explorer/pull/19)

The grouped major-update PR is not being merged because its CI fails before the
remaining compatibility work can be evaluated: `typescript-eslint` currently
reports that it does not support TypeScript 7.0. The PR also combines several
other major upgrades, so accepting it would make the repository's toolchain
change larger than the validated scope of this audit.

The repository remains on the validated TypeScript 5.x toolchain. Dependabot is
configured to ignore only TypeScript major-version updates; patch and minor
updates, including security updates, remain eligible. Reopen this decision when
the supported `typescript-eslint` release is available and the full CI matrix
passes with TypeScript 7.

This is a compatibility deferral, not a security exception. GitHub Dependabot
security updates and automated security fixes remain enabled, and the current
dependency audit is clean.
