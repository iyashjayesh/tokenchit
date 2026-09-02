# tokenstats

Turn your local AI coding agent logs into an embeddable stat card for your GitHub README.

tokenstats reads the transcripts **Claude Code**, **Codex** and **OpenCode** already write to
your disk, totals them, and renders an SVG you commit to your own repo. No account, no
upload, no server — the card is a file.

```bash
npx @tokenstats/cli init     # detect agents, write .tokenstats.json
npx @tokenstats/cli sync     # render tokenstats.svg
npx @tokenstats/cli recap    # render tokenstats-recap.svg — the year in review
```

```markdown
![tokenstats](./tokenstats.svg)
![tokenstats recap](./tokenstats-recap.svg)
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
tokenstats init
  --handle <name>        GitHub handle (default: guessed from your origin remote)

tokenstats sync
  --out <path>           where to write it (default: tokenstats.svg)
  --layout default|compact
  --theme auto|light|dark
  --json                 print the aggregate instead of writing an SVG
  --dry-run              report what would be written, write nothing

tokenstats login          prove your GitHub handle (device flow, no password)
tokenstats logout         forget this machine
tokenstats whoami         who this machine is signed in as

tokenstats publish        the only command that uploads anything
  --dry-run              print the exact bytes and send nothing
  --api <url>            default https://tokenstats-site.vercel.app
  --handle <name>

tokenstats recap
  --out <path>           default: tokenstats-recap.svg
  --year <yyyy>          label the recap with a different year
  --theme auto|light|dark
  --json                 print the recap model instead of writing an SVG
  --dry-run
```

## The recap

`recap` renders a weekday-by-hour heatmap of when you actually work, alongside your totals,
top model and streak — in the terminal and as a second committable SVG:

```
       00    06    12    18
  MON  ▓▓     ░░▓▒░▓▓▒▒█▓▓▒░▒▓▒   71%
  TUE  ▒▒░░  ░░ ░░█████▓▓█▓░      86%
  WED  ░░        ░██▓░████▒░  ░   89%
  SUN  ███▓░     █▓█▒▓█ ▒▒█▒▒▒▓  100%

  peak 11:00-20:00  ·  37 active days
```

Cells are coloured by **rank across the distinct values**, the way GitHub's contribution
graph works, not by magnitude. Token counts are violently skewed — one long session can hold
more than a quiet week — so a linear scale paints a single square hot and leaves the rest
indistinguishable.

Codex only records a running total per session, so its hours land on the session's last
turn. Claude Code and OpenCode are exact to the message.

`sync` writes the SVG and stops — committing on your behalf is your call, not the tool's.

## Publishing to the board

`publish` is the **only** command that sends anything anywhere. `sync` and `recap` are local
forever, and there is deliberately no config switch to change that: `.tokenstats.json` is a
committed file, and a committed file must never be able to cause a network call on somebody
else's machine.

`--dry-run` prints the exact bytes that would be uploaded — the same string, not a rendering
of it, which `dryrun.exact` in the test suite enforces by comparing against what a real
publish puts on the wire. The payload is aggregates only: totals, per-day token counts, agent
and model ids. No prompts, no replies, no branch names, no paths.

## Signing in

```
$ tokenstats login
  Open https://github.com/login/device
  and enter  WDJB-MJHT
✓ signed in as @octocat
```

GitHub's **device flow** — no password, no token to paste, and no localhost callback server,
which matters because the usual OAuth-in-a-CLI approach breaks over SSH, in containers and on
remote dev boxes: exactly where people run coding agents.

**No scopes are requested.** GitHub answers `GET /user` for an unscoped token, and your login
and numeric id are all we need.

The GitHub token is handed to the server **once**, so that the server — not the client — is
what asks GitHub who you are; a client that simply asserted `{"handle": "octocat"}` would be
forgeable. It is then discarded, never written to disk on either side. What you keep is a
tokenstats API key in `~/.config/tokenstats/auth.json`, mode `0600`, stored server-side only as
a SHA-256 hash. Never in `.tokenstats.json`, which is committed.

Without signing in, submissions land as the unverified `cli` tier. Those rows appear on the
board with a badge rather than being hidden — a transparency signal, not a gate. Signing in
upgrades the handle to `verified`, and takes it over from any unverified row that claimed it
first.

### Running the board locally

The board runs against Supabase — there is no local database to start.

```bash
cp apps/site/.env.example apps/site/.env.local   # then fill in the password
npm run db:migrate                               # idempotent; safe to re-run
npm run dev

npx @tokenstats/cli login   --api http://localhost:3000
npx @tokenstats/cli publish --api http://localhost:3000
```

`.env.local` is gitignored; `apps/site/.env.example` documents the shape. Next reads
`.env.local` automatically and the migration runner reads the same file, so the site and the
migrations cannot end up pointing at different databases.

**Use the shared (transaction) pooler on port 6543, not the direct connection on 5432.**
Serverless functions open a connection per invocation and exhaust a direct connection limit
quickly; Supavisor exists for exactly that. The pool in `apps/site/lib/db.ts` is capped at 5
to match.

### Rate limits

Writes are limited per hour, in Postgres rather than in memory — serverless functions share
no memory, so an in-process counter would reset on every cold start and count separately per
instance.

| bucket | limit |
| --- | --- |
| anonymous publish, per IP | 10/h |
| signed-in publish, per user | 60/h |
| publish, per handle | 30/h |
| sign-in, per IP | 20/h |
| board reads, per IP | 300/h |

Signed-in callers get more headroom than anonymous ones: they have proved who they are and
their rows carry their name. The per-handle bucket exists because the per-IP one alone is
defeated by spreading requests across addresses.

Every response carries `x-ratelimit-limit` and `x-ratelimit-remaining`, refusals add
`retry-after`, and the CLI prints the wait rather than a bare status code.

### Notes on the database

- **`003_rls.sql` is not optional on Supabase.** Supabase exposes every `public` table
  through PostgREST using the anon key, which is public by design. Without row level security
  enabled, that key would read `api_tokens` and the entire submissions history. The migration
  enables RLS with no policies, which closes that surface completely and changes nothing for
  our server, which connects directly as the table owner.
- **Free Supabase projects pause after 7 days of low activity** and need a human to click
  *Resume* in the dashboard, with a 90-day window before the backup expires. A few requests a
  day avoids it, so it bites a quiet project rather than a busy one. That is why
  [`docs/research.md`](./docs/research.md) §4 prefers Neon, whose idle behaviour is
  scale-to-zero with automatic resume.
- Migrations are plain SQL in `apps/site/db/migrations/`, applied in filename order and
  tracked in a `_migrations` table. There is no local Postgres: a contributor who only needs
  the CLI or the card never touches a database, and `npm test` requires none.

## Repo layout

```
apps/site/          Next.js marketing site + the board API
packages/core/      adapters, aggregation, price table, SVG builder
packages/cli/       the tokenstats binary
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

Spend-based tier ladders, pricing, a blog, a site dark-mode toggle, and scheduled-Action
automation.

**A browser session, deliberately.** Sign-in happens in the terminal, and nothing on the site
is per-user — no settings, no upload form, no private page. Identity exists to stamp a row on
the board, and only the CLI can produce a row. Adding browser OAuth would mean GitHub's web
flow, which is the one flow that needs a client secret, in exchange for a header pill.
