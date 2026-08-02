# Contributing

Thanks for helping keep the catalog useful and honest.

## Local workflow

```bash
pnpm install
pnpm data:validate
pnpm data:build
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

## Data corrections

- Use the official provider URL that supports the exact field being changed.
- Update `checkedAt` / `lastVerifiedAt` in the same change.
- Keep provider, model, offer and pricing-rule IDs stable unless the upstream API ID changed.
- Use `null` when a value is not published. Never turn an unknown into zero.
- Add a history event only for a reviewed dated observation; do not infer a previous price from memory.
- Run `pnpm data:validate` and `pnpm data:build` so public JSON/CSV stay in sync.

## Benchmarks

Use [`docs/benchmark-submission.md`](docs/benchmark-submission.md). Do not add paid provider keys to GitHub Actions or commit secrets. A benchmark must state the exact offer/API model ID, prompt shape, token counts, region, concurrency, warmups, repetitions, timestamp and methodology URL.

## Pull requests

Describe the user-facing impact, cite the source or reproduction, and include the relevant command results. Small focused PRs are easier to review. Accessibility, keyboard navigation, responsive behavior and dark/light theme changes should include an updated screenshot when layout changes.
