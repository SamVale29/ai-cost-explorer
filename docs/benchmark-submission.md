# Benchmark submission template

Use this template when submitting a reproducible observed-performance result.

- Hardware:
- Region:
- Provider:
- API model ID:
- Measurement date (UTC):
- Protocol: `standard-v1`
- Raw results:
- Command executed:
- Confirm no API keys, tokens, prompts containing secrets, or private customer data are included: yes

Results must include the benchmark version, concurrency, repetitions, input/output sizes, TTFT and throughput methodology. Observed results are not provider specifications.

The local runner is intentionally opt-in:

```bash
pnpm benchmark -- --dry-run
pnpm benchmark:check-empty
pnpm benchmark -- --provider openai --model gpt-4.1 --execute --write
```

The first two commands are CI-safe and perform no network request. The third requires a local `OPENAI_API_KEY`, sends only the fixed public prompt in `scripts/benchmark.ts`, and writes a summary only after all warmups and measured repetitions complete. Never run it with customer prompts or production credentials. `benchmark:check-empty` is intentionally a temporary guard for the current empty benchmark baseline; a reviewed benchmark submission must update that policy in the same change.
