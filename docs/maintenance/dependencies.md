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

## Production and development major-update groups

- Decision date: 2026-09-20
- Status: deferred pending a compatible, green update
- References: Dependabot PRs [#22](https://github.com/SamVale29/ai-cost-explorer/pull/22) and [#23](https://github.com/SamVale29/ai-cost-explorer/pull/23)

The production group currently upgrades React, lucide-react, react-router-dom
and Zod together; the development group also changes the test, lint and build
toolchain. Both grouped PRs failed the quality workflow. The production failure
included the removal of the Github brand icon from lucide-react, which was
adapted in the application to the stable Code2 icon so the application is
compatible with the newer icon API without coupling the repository to a brand
asset.

The grouped dependency PRs remain closed/deferred until their complete matrix
is independently validated. This keeps the verified React 19.2, lucide-react
0.x, Zod 3 and TypeScript 5.x combination in production while retaining the
security audit and Dependabot update paths. Reopen the upgrades as smaller,
green changes when each major API surface has a passing CI run.
