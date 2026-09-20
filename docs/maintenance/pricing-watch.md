# Pricing watch maintenance

The pricing watcher compares model-scoped price signals against official source pages. It is a
semantic evidence check, not a generic page hash: a successful run must find every registered
signal and must compare the current signal-key schema with the reviewed baseline.

## Current review queue

The following source groups were verified with complete evidence on 2026-09-20 and are eligible
for baseline migration:

| Source                        | Evidence |
| ----------------------------- | -------: |
| OpenAI API pricing            |    32/32 |
| Google Gemini pricing         |    42/42 |
| xAI developer pricing         |    48/48 |
| Together AI serverless models |    10/10 |

The remaining non-empty sources are deliberately still review items:

| Source group                  | Current evidence | Next action                                                                                           |
| ----------------------------- | ---------------: | ----------------------------------------------------------------------------------------------------- |
| OpenAI GPT-4.1 model page     |              0/3 | Add an adapter for the page's current pricing representation or move the signals to the pricing page. |
| Anthropic pricing             |            30/40 | Disambiguate batch cache-write/cache-read evidence.                                                   |
| Mistral model cards (6 pages) |         0/3 each | Add a model-card adapter or register the authoritative pricing page.                                  |
| Cohere model pages (4 pages)  |         0/2 each | Add a model-page adapter or register the authoritative pricing page.                                  |
| DeepSeek pricing              |              0/6 | Add an adapter for the current pricing page.                                                          |
| Groq models                   |              0/4 | Add an adapter for the current catalog representation.                                                |
| Together inference pricing    |              0/2 | Add an adapter for the current inference pricing representation.                                      |

Sources with zero expected signals are metadata references and do not require a pricing baseline.
They remain registered for source health and provenance checks.

## Safe baseline migration

Run the watcher first:

```text
pnpm pricing:watch
```

Exit code `2` means the run is inconclusive: the watcher found evidence or baseline work that
needs review and makes no unchanged-price claim. A source can be migrated individually only after
all of its registered signals are present:

```text
pnpm pricing:watch -- --update-baseline-url=https://developers.openai.com/api/docs/pricing
```

The migration command refuses to write a selected baseline when any registered signal is missing
or ambiguous. This prevents incomplete source coverage from being recorded as a trusted baseline.

For an intentional bulk schema migration, review every source result first and then use:

```text
pnpm pricing:watch -- --update-baseline
```

Bulk migration records the current `present`, `missing`, and `ambiguous` evidence states for every
reachable source. It does not waive the review queue: sources with incomplete evidence continue to
make the normal watcher exit `2` until an adapter or authoritative source is added. The command
refuses to replace the full file when any source is unreachable.
