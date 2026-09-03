# @tokenstats/core

The engine behind [`@tokenstats/cli`](https://www.npmjs.com/package/@tokenstats/cli): local
agent-log adapters, usage aggregation, a vendored price table, and the SVG builders for the
stat card and the year-in-review recap.

Published so the website and the CLI render through one copy — a card built here looks
identical wherever it is drawn. Most people want the CLI, not this.

```bash
npm install @tokenstats/core
```

## Two entry points

```ts
// Isomorphic: no filesystem, safe in a browser bundle.
import { buildCardSvg, buildRecapSvg, aggregate, buildRecap,
         formatTokens, formatUsd, validatePayload } from "@tokenstats/core";

// Node only: reads local agent logs.
import { adapters, readAll, claudeCode, codex, opencode } from "@tokenstats/core/adapters";
```

The split is deliberate. The adapters import `node:fs` and `node:sqlite`; re-exporting them
from the main entry would drag Node built-ins into any web bundle that imports the card
builder, which is exactly how the first deploy of the site broke.

## Example

```ts
import { aggregate, buildCardSvg, formatTokens, formatUsd } from "@tokenstats/core";
import { readAll } from "@tokenstats/core/adapters";

const stats = await aggregate(readAll());

const svg = buildCardSvg({
  handle: "octocat",
  tokens: formatTokens(stats.tokens),
  spend: formatUsd(stats.equivCostUsd),
  streak: `${stats.streakDays}d`,
  mix: stats.mix,
  syncedAt: new Date(),
});
```

## Things worth knowing

- **Claude Code repeats messages across session files.** The adapter deduplicates on
  `(message.id, requestId)`. On a real 298 MB corpus, 11,499 usage rows collapse to 6,185
  distinct messages — skipping this nearly doubles every figure.
- **Codex reports running totals**, not per-turn deltas. Each session file contributes its
  final cumulative value; summing the events overcounts by orders of magnitude.
- **Days are bucketed by local date**, not UTC, so a streak is not broken for anyone whose
  evening sessions land on the next UTC day.
- **Prices are vendored**, never fetched. The card renders the same on a plane as online.
- `costOf` returns `null` for models with no public price. Callers must exclude them from a
  cost figure rather than treat them as free.

Requires Node 22 or newer — the OpenCode adapter uses the built-in `node:sqlite`.

MIT licensed. Source and issues:
[github.com/iyashjayesh/tokenstats](https://github.com/iyashjayesh/tokenstats).
