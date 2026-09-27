# @tokenchit/cli

Turn your local AI coding agent logs into an embeddable stat card for your GitHub README.

Reads the transcripts **Claude Code**, **Codex**, **Gemini CLI** and **OpenCode** already write to your disk,
totals them, and renders an SVG you commit to your own repo. No account, no upload, no server
— the card is a file.

```bash
npx @tokenchit/cli generate --no-publish   # detect, render tokenchit.svg, stop
```

That is the whole local flow in one command. Without `--no-publish` it goes on to offer the
public board — at a terminal it asks first; see [Publishing is opt-in](#publishing-is-opt-in)
for what a scripted run does. The two steps it composes are also commands of their own:

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
| Claude Code | `~/.claude*/projects/**/*.jsonl` — every profile directory, not just the default |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` |
| OpenCode | `~/.local/share/opencode/opencode.db` |
| Gemini CLI | `~/.gemini/tmp/*/chats/*.jsonl` |

Gemini records token counts only in recent versions. An installation whose recordings all
predate that is reported as detected-but-uncountable rather than as a zero.

**Copilot CLI is detected but cannot be counted.** It records only a live context-window
gauge, never a cumulative total. `init` says so out loud rather than silently omitting it.

Nothing but token counts, model ids and timestamps is read. No prompts, no completions, no
file contents, and no paths — not hashed, not truncated, absent.

## Commands

```
tokenchit generate        init if needed, then sync, then offer the board
  --no-publish             stop after writing the card; nothing leaves your machine
  --handle <name>          GitHub handle (default: guessed from your origin remote)
  --out <path>             default: tokenchit.svg
  --theme auto|light|dark

tokenchit init            detect agents, write .tokenchit.json
  --handle <name>          GitHub handle (default: guessed from your origin remote)

tokenchit sync            render the card
  --out <path>             default: tokenchit.svg
  --layout default|compact
  --theme auto|light|dark
  --json                   print the aggregate instead of writing an SVG
  --dry-run

tokenchit doctor          check what is detected, readable and configured
  --json                   machine-readable, for a CI step or an issue report

tokenchit recap           year in review: heatmap, models, totals
  --out <path>             default: tokenchit-recap.svg
  --year <yyyy>            the year to report on (default: this year)

tokenchit ledger          show the local history bank, export it, or merge one in
  --export <file>          a portable copy: usage only, no credentials or paths
  --import <file>          preview a merge; nothing is written without --apply
  --apply                  commit the previewed import, keeping a backup
  --rebuild                re-derive from the logs still on disk
  --yes                    required by --rebuild, which cannot be undone

> **Upgrading migrates the ledger, and going back a version is not safe.** An older tokenchit
> reads the new format as unrecognised and rewrites it from whatever logs are still on disk.
> Upgrading is lossless and the CLI says so once. If you might roll back, run
> `tokenchit ledger --export` first.

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

tokenchit publish         upload to the board (`generate` ends by calling this)
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

`init`, `sync`, `recap`, `ledger` and `doctor` are local forever — they do not import the
networking module at all, which a test enforces rather than a promise. `publish` is the only
code path that sends anything, and `generate` reaches it by ending with a call to it.

So `generate` is the one command that can upload, and it asks before it does. At a terminal
it names the board and waits for a `y`; anything else keeps the card and stops. A piped or
scripted run has no one to ask, so it publishes as it always has — `--no-publish` is the way
to keep those local, and it returns before any network code is even loaded.

There is deliberately no config switch for this: `.tokenchit.json` is a committed file, and a
committed file must never be able to cause a network call on someone else's machine.

`--dry-run` prints the exact bytes that would be uploaded — the same string, not a rendering
of it, which a test in this package enforces by comparing against what a real publish puts on
the wire.

Requires Node 22 or newer. MIT licensed. Source, issues and the full documentation:
[github.com/iyashjayesh/tokenchit](https://github.com/iyashjayesh/tokenchit).
