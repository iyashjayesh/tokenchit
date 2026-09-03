# @tokenstats/cli

Turn your local AI coding agent logs into an embeddable stat card for your GitHub README.

Reads the transcripts **Claude Code**, **Codex** and **OpenCode** already write to your disk,
totals them, and renders an SVG you commit to your own repo. No account, no upload, no server
— the card is a file.

```bash
npx @tokenstats/cli init     # detect agents, write .tokenstats.json
npx @tokenstats/cli sync     # render tokenstats.svg
```

```markdown
![tokenstats](./tokenstats.svg)
```

## What it reads

| Agent | Source |
| --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` |
| OpenCode | `~/.local/share/opencode/opencode.db` |

**Copilot CLI and Gemini CLI are detected but cannot be counted.** Copilot records only a
live context-window gauge, never a cumulative total; Gemini's chat transcripts carry no token
counts at all. `init` says so out loud rather than silently omitting them.

Nothing but token counts, model ids and timestamps is read. No prompts, no completions, no
file contents, and no paths — not hashed, not truncated, absent.

## Commands

```
tokenstats init            detect agents, write .tokenstats.json
  --handle <name>          GitHub handle (default: guessed from your origin remote)

tokenstats sync            render the card
  --out <path>             default: tokenstats.svg
  --layout default|compact
  --theme auto|light|dark
  --json                   print the aggregate instead of writing an SVG
  --dry-run

tokenstats recap           year in review: heatmap, models, totals
  --out <path>             default: tokenstats-recap.svg
  --year <yyyy>

tokenstats login           prove your GitHub handle (device flow, no password)
tokenstats logout
tokenstats whoami

tokenstats publish         the only command that uploads anything
  --dry-run                print the exact bytes and send nothing
  --api <url>
```

## Equivalent API cost is not spend

The dollar figure is **what your tokens would cost at list API rates** — not what you paid.
Most agent usage runs under a subscription where no per-token charge ever happens. Models
with no public price are counted in the token total and left out of the cost, and `sync`
tells you what share of tokens the figure covers.

## Publishing is opt-in

`sync` and `recap` are local forever. `publish` is the only command that sends anything, and
there is deliberately no config switch to change that: `.tokenstats.json` is a committed
file, and a committed file must never be able to cause a network call on someone else's
machine.

`--dry-run` prints the exact bytes that would be uploaded — the same string, not a rendering
of it, which a test in this package enforces by comparing against what a real publish puts on
the wire.

Requires Node 22 or newer. MIT licensed. Source, issues and the full documentation:
[github.com/iyashjayesh/tokenstats](https://github.com/iyashjayesh/tokenstats).
