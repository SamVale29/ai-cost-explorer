# AI Cost Explorer

AI Cost Explorer is a small, independent, open-source decision tool for comparing AI API offers before a workload becomes a bill. It keeps model identity, provider identity, commercial offer, pricing rules, official sources, historical observations and measured benchmarks as separate, inspectable data.

**Live app:** [omentordotrader-afk.github.io/ai-cost-explorer](https://omentordotrader-afk.github.io/ai-cost-explorer/)

**Author & maintainer:** Sam Vale

![AI Cost Explorer social preview](public/brand/social-preview.png)

## What it does

- Searches a catalog of 44 verified offers across 9 direct API providers.
- Separates canonical models from API providers and provider-specific offers.
- Shows input, cached-input, cache-write, output, context, modalities, capabilities, status and staleness.
- Builds shareable 2–4 offer comparisons with a differences-only view and JSON export.
- Simulates per-request, daily, monthly and annual cost with cache, cache-write, batch share, retries and long-context tiers.
- Publishes a first-observation price history without inventing a line before the project existed.
- Shows a workload-neutral Pareto frontier and an optional, transparent value score.
- Keeps unknown fields as `null` / “Not verified” and links every price to an official source.

The project is not affiliated with any listed provider. Prices and capabilities change; verify a critical purchase with the provider’s own documentation.

## Quick start

Requirements: Node.js 20+, pnpm 11 and a current browser.

```bash
pnpm install
pnpm data:validate
pnpm data:build
pnpm dev
```

Open `http://localhost:5173/`. The production build uses the `/ai-cost-explorer/` base path used by GitHub Pages.

## Quality gates

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

The E2E suite starts a production preview and covers the landing page, catalog explorer, shareable comparison and workload simulator. Paid provider benchmarks are never called by CI.

## Data model

The source-of-truth files live under [`data/`](data/):

| Entity | Role |
| --- | --- |
| Organization | Canonical company or model owner. |
| Model | Canonical model identity, context, modalities and capabilities. |
| Provider | API surface, including direct provider status and pricing/docs links. |
| Offer | A provider + API model ID + commercial availability. |
| PricingRule | Unit, mode, tier, input/cache/output prices and provenance. |
| SourceReference | Official URL, publisher, source type and verification date. |
| BenchmarkResult | Measured performance evidence only; empty until reproducibly run. |
| PriceChangeEvent | Reviewed, dated observation or price change; no synthetic backfill. |

The generated, public artifacts are in [`public/data/`](public/data/):

- [`catalog-v1.json`](public/data/catalog-v1.json) — complete joined catalog.
- [`catalog-v1.csv`](public/data/catalog-v1.csv) — spreadsheet-friendly offer rows.
- [`history-v1.json`](public/data/history-v1.json) — project price observations.
- [`benchmarks-v1.json`](public/data/benchmarks-v1.json) — currently an honest empty set.
- [`schema-v1.json`](public/data/schema-v1.json) — schema version, entities and null-value policy.

`dataAsOf` is `2026-08-02`. The 22 registered URLs in [`data/sources/index.json`](data/sources/index.json) are the provenance registry. Every price is stored at offer/pricing-rule level, not as an unattributed model label.

## Calculator contract

The simulator uses decimal arithmetic:

```text
standard input = max(0, input − cached − cache writes)
token cost = tokens / 1,000,000 × applicable price
request cost = standard input + cached input + cache write + output
adjusted requests/day = base requests × (1 + retry rate)
monthly = request cost × adjusted requests/day × days/month
annual = monthly × 12
```

Batch is blended only for the chosen share of requests and only when a batch rule is published. A tier is selected from the request input token count. If a used price component is unknown, the total stays “Not verified” instead of silently treating it as zero.

## Routes

- `/` — landing page and catalog preview.
- `/explore` — filters, sortable table, JSON/CSV export and selection dock.
- `/compare?compare=offer-a,offer-b` — 2–4 offer comparison.
- `/calculator` — workload cost simulator.
- `/history` — dated project observations.
- `/value` — Pareto frontier and optional transparent ranking.
- `/methodology` — public method, entities, sources, freshness and limits.
- `/model/:modelId` — model detail, commercial offers and evidence status.

## Keeping data honest

1. Add or update a source in the same change as the field it supports.
2. Use `null` when an official source does not verify a value.
3. Keep source `checkedAt` and offer `lastVerifiedAt` explicit.
4. Do not backfill price history from memory or from an undated page.
5. Add a reproducible benchmark record only when the protocol, region, repetitions and source are documented.
6. Run `pnpm data:validate`, `pnpm data:check-sources` and `pnpm data:build` before opening a pull request.

See [`docs/methodology.md`](docs/methodology.md), [`docs/data-contract.md`](docs/data-contract.md) and [`docs/benchmark-submission.md`](docs/benchmark-submission.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm data:validate` | Checks entity references, source fields, prices, tiers and release targets. |
| `pnpm data:build` | Joins `data/` into public JSON/CSV artifacts. |
| `pnpm data:check-sources` | Checks source URL shape; `CHECK_SOURCES_NETWORK=1` also performs a non-mutating network check. |
| `pnpm data:snapshot` | Writes an immutable dated catalog snapshot. |
| `pnpm generate:og` | Rebuilds the social preview image. |
| `pnpm generate:screenshots` | Captures landing/explorer launch screenshots from a local preview. |
| `pnpm benchmark` | Prints the safe benchmark protocol; execution is opt-in. Local OpenAI runs use `pnpm benchmark -- --provider openai --model gpt-4.1 --execute --write`. |

## Contributing

Corrections, new providers, official pricing sources, accessibility improvements and reproducible benchmark submissions are welcome. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) and use the issue templates. The project is licensed under the [MIT License](LICENSE).

See [`AUTHORS.md`](AUTHORS.md) for project attribution.
