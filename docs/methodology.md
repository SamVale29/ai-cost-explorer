# AI Cost Explorer methodology

Version: `v0.1.0` · the generated catalog date is the latest `checkedAt` in the source registry

AI Cost Explorer is a comparison aid, not a provider ranking and not a purchasing quote. The method is intentionally inspectable: a reader should be able to follow a displayed number back to a field, a pricing rule and an official source.

## Scope and source hierarchy

The beta covers public AI API information available in official provider documentation or pricing pages. The preferred evidence order is:

1. official pricing page or model card;
2. official API documentation or release note that states a price or billing rule;
3. measured project benchmark with the published protocol;
4. community evidence, only when clearly labeled and never used to fill an official price.

The current source registry is [`data/sources/index.json`](../data/sources/index.json). Each reference carries a URL, title, publisher, source type and `checkedAt` date. A source being official does not make its field permanent; it only records where the field was checked.

## Entity model

The project keeps these concepts separate:

```text
Organization ── owns/brands ── Model
Provider ── serves ── Offer ── has ── PricingRule
Model / Offer / PricingRule ── cite ── SourceReference
Offer ── may have ── BenchmarkResult
Offer ── may have ── PriceChangeEvent
```

An offer is the commercial unit: provider, API model ID, availability and one or more pricing rules. The same canonical model can therefore appear as multiple offers without merging provider-specific economics.

## Pricing rules

Prices are stored in USD and explicitly declare a billing unit and mode. A rule can also declare `minimumInputTokens` or `maximumInputTokens`, `effectiveFrom`, `effectiveUntil`, cache prices and source-specific notes.

The simulator applies the rule matching the request input token count. If several rules match, the one with the highest matching minimum tier wins. A missing standard rule, batch rule or used price component is surfaced as a warning.

### Workload calculation

```text
cached input tokens = min(requested cached input, total input)
cache-write tokens  = min(requested cache-write input, total input − cached input)
standard input tokens = max(0, total input − cached input − cache-write input)
standard input cost   = standard input tokens / 1M × mixed input rate
cached input cost     = cached tokens / 1M × mixed cache-hit rate
cache-write cost      = write tokens / 1M × mixed cache-write rate
output cost           = output tokens / 1M × mixed output rate
request cost          = sum of the four components
daily cost            = request cost × requests/day × (1 + retry rate)
monthly cost          = daily cost × days/month
annual cost           = monthly cost × 12
```

Cache hits take precedence when requested buckets exceed total input; cache writes use the remaining input, and cached tokens are never counted twice. Batch is a weighted blend over the chosen batch fraction; it is not applied to an offer that does not publish a batch rule. Decimal arithmetic is used to avoid binary floating-point surprises.

### Saved scenarios

The calculator can save up to 12 named scenarios in the browser's local storage. A scenario contains only the workload inputs, selected offer IDs and display mode, so it can be reloaded for a local what-if comparison. Scenarios can also be duplicated or exported/imported as a versioned JSON file. A share link encodes the current assumptions and selected offer IDs in the URL; it does not contain credentials or provider responses. Scenarios are not part of the catalog, are not sent to providers and are not synchronized to a server. If browser storage is unavailable, the calculator continues to work without persistence.

### What is deliberately not modeled

The beta does not estimate currency conversion, taxes, reserved contracts, private tiers, downstream hosting, vector databases, network egress, image/audio units that are not token-equivalent, or provider-specific minimum commitments. Audio-only offers can be present with null token prices so the UI does not imply a false token quote.

## Freshness and staleness

The UI uses the latest explicit `lastVerifiedAt` or `checkedAt` date:

- Fresh: 0–30 days old.
- Aging: 31–60 days old.
- Stale: 61+ days old.
- Unknown: missing or invalid date.

Stale data stays visible with a warning. Staleness is a review signal, not permission to delete or rewrite a record.

## Price history

History records project detection events, not a reconstruction of provider history. The initial beta contains three dated observations on the project start date. Their `previousPricing` arrays are empty because there is no earlier project observation. No chart line is drawn before that date. A later change should include:

- detected date;
- effective date when an official source provides one;
- previous and current pricing rules;
- the official source;
- a reviewed diff or commit reference.

## Benchmarks

No benchmark result is published in the initial dataset. The safe harness prints the protocol and refuses to run paid calls unless explicitly invoked with provider keys. The intended baseline protocol is documented in [`benchmark-submission.md`](benchmark-submission.md): two warmups, at least five measured repetitions, concurrency one, streaming for TTFT, P50/P95, region, UTC timestamp and exact prompt/token shape.

Performance values are evidence from a workload, not a property of a model in all contexts. CI never runs paid benchmark requests.

## Value frontier and ranking

The `/value` page can plot known price/context axes and marks non-dominated offers. Missing axis values are excluded from the plot rather than scored as zero. The optional ranking normalizes a small set of known fields and shows weights in the UI. It is explicitly a decision aid, not an intelligence score or universal “best model” claim.

## Data update workflow

```text
official page → reviewed data edit → validation → snapshot → build → CI → deploy
```

The weekly pricing-watch job checks the source registry, fetches the pages, compares a reviewed pricing-signal fingerprint and validates the catalog. It fails on unavailable sources, missing baselines or changed fingerprints without mutating catalog data; updating a baseline is an explicit reviewed action. A human review is still required for a price edit, history event or benchmark submission.

The generated [`catalog-health-v1.json`](../public/data/catalog-health-v1.json) records how much of the reviewed snapshot is known: pricing-field coverage, model-field coverage, source freshness and whether measured benchmarks exist. Coverage is descriptive, not a provider quality score; an unknown field remains unknown in the catalog.

## Limitations

- Provider pages can change outside the watch schedule or block automated requests.
- Prices may differ by region, endpoint, tier, contract, tax or effective date.
- Capability fields are only claims supported by the cited source; unknown is not “no.”
- Context and output limits can differ across API surfaces even for similarly named models.
- The current benchmark dataset is empty, so no performance ranking is implied.
- The catalog is a curated public snapshot, not an exhaustive market index.
