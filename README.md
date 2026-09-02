# tokencard

Turn your local AI coding agent logs into an embeddable stat card for your GitHub README.

tokencard reads the transcripts **Claude Code**, **Codex** and **OpenCode** already write to
your disk, totals them, and renders an SVG you commit to your own repo. No account, no
upload, no server — the card is a file.

```bash
npx @tokencard/cli init     # detect agents, write .tokencard.json
npx @tokencard/cli sync     # render tokencard.svg
```

```markdown
![tokencard](./tokencard.svg)
```

## What it reads

| Agent | Source |
| --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` |
| OpenCode | `~/.local/share/opencode/opencode.db` |

**Copilot CLI and Gemini CLI are detected but cannot be counted.** Copilot records only a
live context-window gauge, never a cumulative total; Gemini's chat transcripts carry no token
counts at all. `init` says so out loud rather than silently omitting them — if either starts
writing usage, they become adapters.

Nothing but token counts, model ids and timestamps is read. No prompts, no completions, no
file contents, no paths leave the aggregation.

## Equivalent API cost is not spend

The dollar figure is **what your tokens would cost at list API rates** — not what you paid.
Most agent usage runs under a subscription where no per-token charge ever happens. Models
with no public price (bundled or self-hosted ones) are counted in the token total and left
out of the cost, and `sync` tells you what share of tokens the figure actually covers:

```
! Cost covers 99.6% of tokens — no public price for: qwen3-coder-next, big-pickle
```

Prices are vendored from [LiteLLM](https://github.com/BerriAI/litellm) and refreshed by a
maintainer with `node packages/core/scripts/refresh-prices.mjs`. The CLI itself never makes
a network request.

## Commands

```
tokencard init
  --handle <name>        GitHub handle (default: guessed from your origin remote)

tokencard sync
  --out <path>           where to write it (default: tokencard.svg)
  --layout default|compact
  --theme auto|light|dark
  --json                 print the aggregate instead of writing an SVG
  --dry-run              report what would be written, write nothing
```

`sync` writes the SVG and stops — committing on your behalf is your call, not the tool's.

## Repo layout

```
apps/site/          Next.js marketing site (tokencard.dev)
packages/core/      adapters, aggregation, price table, SVG builder
packages/cli/       the tokencard binary
docs/research.md    positioning, competitive landscape, infrastructure decisions
```

The site and the CLI render through the same `buildCardSvg()`, so they cannot drift.

```bash
npm install
npm run build     # core, then cli, then site
npm test          # adapter and aggregation tests
npm run dev       # the site at http://localhost:3000
```

Requires Node 22 or newer — OpenCode support uses the built-in `node:sqlite`.

## The hosted endpoint

`apps/site` also serves `GET /api/card/<handle>.svg` with `layout`, `theme`, `agents`, `hide`
and `cache` parameters. It renders sample data and exists to demonstrate the builder. The
supported path is the committed SVG: it costs nothing to run, cannot be abused, and — unlike
an external image — GitHub serves it straight from `raw.githubusercontent.com` rather than
through its camo proxy.

## Design and research

Built from the design handoff in [`design_handoff_tokencard_site/`](./design_handoff_tokencard_site).
Positioning, the competitive landscape and infrastructure decisions are researched and cited
in [`docs/research.md`](./docs/research.md).

Site conventions: border radius is 0 everywhere, shadows are hard offsets only, there are no
media queries, and the blinking `▌` after the install command is the only animation.

## Not built, deliberately

A leaderboard backend, GitHub OAuth, spend-based tier ladders, pricing, a blog, a site
dark-mode toggle, and scheduled-Action automation. Sign-in on the site is local client state
behind `useSiteState()`, ready for a real provider if one is ever needed.
