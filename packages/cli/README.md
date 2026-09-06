# @tokenchit/cli

Turn your local AI coding agent logs into an embeddable stat card for your GitHub README.

Reads the transcripts **Claude Code**, **Codex** and **OpenCode** already write to your disk,
totals them, and renders an SVG you commit to your own repo. No account, no upload, no server
— the card is a file.

```bash
npx @tokenchit/cli init     # detect agents, write .tokenchit.json
npx @tokenchit/cli sync     # render tokenchit.svg
```

```markdown
![tokenchit](./tokenchit.svg)
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
tokenchit init            detect agents, write .tokenchit.json
  --handle <name>          GitHub handle (default: guessed from your origin remote)

tokenchit sync            render the card
  --out <path>             default: tokenchit.svg
  --layout default|compact
  --theme auto|light|dark
  --json                   print the aggregate instead of writing an SVG
  --dry-run

tokenchit recap           year in review: heatmap, models, totals
  --out <path>             default: tokenchit-recap.svg
  --year <yyyy>            the year to report on (default: this year)

tokenchit ledger          show the local history bank, or rebuild it
  --rebuild                re-derive from the logs still on disk
  --yes                    required by --rebuild, which cannot be undone

tokenchit hook install    refresh and stage the card on every commit
tokenchit hook uninstall

tokenchit schedule        print a cron, launchd or schtasks entry
  --every daily|hourly
  --cron                   force a crontab line even on macOS

tokenchit login           prove your GitHub handle (device flow, no password)
  --no-clipboard           do not copy the device code
  --no-browser             do not open the verification page
  --force                  sign in again when already signed in

tokenchit logout          revoke this machine's key and forget it
tokenchit whoami          who this machine is signed in as, checked with the server

tokenchit unpublish       remove your row from the board, and your data with it
  --yes                    skip the confirmation prompt
  --export <path>          save everything to JSON first

tokenchit publish         the only command that uploads anything
  --dry-run                print the exact bytes and send nothing
  --api <url>

anywhere:
  --color always|never|auto   (or NO_COLOR=1 / FORCE_COLOR=1)
```

Every flag above is accepted — a test walks the help table and the flag guard together, after
six documented flags were rejected as unknown by a shipped build.

## Equivalent API cost is not spend

The dollar figure is **what your tokens would cost at list API rates** — not what you paid.
Most agent usage runs under a subscription where no per-token charge ever happens. Models
with no public price are counted in the token total and left out of the cost, and `sync`
tells you what share of tokens the figure covers.

## Taking it back

`tokenchit unpublish` deletes the account, every submission and every daily figure the board
holds, and signs this machine out — the profile page, the hosted card and the link preview go
with it. `--export <path>` writes the lot to JSON first, which is worth doing: history that
retention has already taken from your logs cannot be rebuilt afterwards.

`tokenchit logout` now revokes the key with the server rather than only deleting the local
copy, so a key that reached a CI log or a synced dotfile stops working.

The card in your repo is a file you committed. It stays where it is; removing it is a
`git rm`, not something a CLI should do to your repository.

## Publishing is opt-in

`sync` and `recap` are local forever. `publish` is the only command that sends anything, and
there is deliberately no config switch to change that: `.tokenchit.json` is a committed
file, and a committed file must never be able to cause a network call on someone else's
machine.

`--dry-run` prints the exact bytes that would be uploaded — the same string, not a rendering
of it, which a test in this package enforces by comparing against what a real publish puts on
the wire.

Requires Node 22 or newer. MIT licensed. Source, issues and the full documentation:
[github.com/iyashjayesh/tokenchit](https://github.com/iyashjayesh/tokenchit).
