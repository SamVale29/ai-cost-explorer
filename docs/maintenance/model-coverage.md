# Model coverage review

The pricing watcher verifies sources already registered in the catalog. It is
not a model-discovery system, so newly launched models must also be reviewed
through the manifest at `data/sources/model-coverage.json`.

The CI command `pnpm data:check-model-coverage` requires every tracked token
model to have a catalog model, an active offer and an official source. It also
requires every explicitly deferred non-token model to have a reason and no
active offer. This makes launch review visible in code review instead of
silently treating an absent model as covered.

The current manifest tracks GPT-6 Astra, Grok 4.6 and Grok 4.20 Multi-Agent
with their exact API IDs and token ranges. It records these xAI modalities as
deferred until the catalog and calculator can represent their native units:

- `grok-imagine-image-2.0`: per-image pricing varies by resolution and quality.
- `grok-imagine-video-1.5`: mixed per-image input and per-second video output.
- `grok-voice-think-fast-2.0`: per-minute audio plus text-input pricing.

These entries are intentionally not converted to token prices. When
unit-aware UI and calculator support lands, the deferred entries should move
to tracked offers with exact source-backed dimensions and regression tests.
