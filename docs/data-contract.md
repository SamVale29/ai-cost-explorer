# Data contract v1

The public contract is generated at [`public/data/schema-v1.json`](../public/data/schema-v1.json). Source-of-truth edits belong under [`data/`](../data/), and `pnpm data:build` regenerates the joined public artifacts.

## Required entities

| Entity | Stable key | Required relationship |
| --- | --- | --- |
| Organization | `id` | Referenced by `Model.organizationId`. |
| Provider | `id` | Referenced by `Offer.providerId`. |
| Model | `id` | Referenced by `Offer.modelId`. |
| Offer | `id` | Has one provider, one model and at least one source. |
| PricingRule | `id` | Nested under an offer; has currency, unit, mode and sources. |
| SourceReference | `url` | Must be an HTTP(S) URL with publisher, type and check date. |
| BenchmarkResult | `id` | References an offer and a reproducible methodology URL. |
| PriceChangeEvent | `id` | References an offer, source, previous pricing and current pricing. |

## Null policy

`null` means “not verified in the cited source at the dataset date.” It does not mean zero, free, unsupported, or lower quality. The UI renders null price/capability/context fields as “Not verified” or an em dash and avoids using them as known values in the frontier.

## Pricing rule example

```json
{
  "id": "provider-model-standard",
  "currency": "USD",
  "unit": "per_million_tokens",
  "mode": "standard",
  "inputPrice": 1.25,
  "cachedInputPrice": 0.125,
  "outputPrice": 10,
  "minimumInputTokens": 0,
  "maximumInputTokens": 200000,
  "sources": [
    {
      "url": "https://provider.example/pricing",
      "title": "Official pricing",
      "publisher": "Provider",
      "sourceType": "official-pricing",
      "checkedAt": "2026-08-02"
    }
  ]
}
```

Every price change should preserve the old rule in a reviewed history event rather than silently overwriting a displayed history line. Every generated file should be reproducible from the source-of-truth JSON and the fixed dataset date recorded by the build script.
