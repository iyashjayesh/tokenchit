# Internals

Why this project behaves the way it does, in more detail than a README should carry. The
reasoning here came out of real investigation — measured against real corpora, not assumed —
and is kept so it does not have to be rediscovered.

## Why the total differs from Claude Code's Stats panel

### Why the total differs from Claude Code's Stats panel
**The Stats panel counts each API call once per streaming rewrite.** Claude Code rewrites an
assistant message in the transcript as it streams, so one call leaves several `usage` records
carrying the same growing figures. `stats-cache.json` sums them as written. On one machine,
51,373 usage records represented 23,644 real API calls, and the cache matched the naive sum of
all 51,373 to the exact token on 28 of 57 days — and matched the deduplicated total on none.
tokenchit collapses those to one row per call. That is safe to do: every message id observed
more than once carried exactly one `requestId`, without exception, and deduplicating by
`message.id` and by `requestId` independently agreed to within 0.002%. Counting them again
would invent tokens nobody was billed for.
**Claude Code also deletes old transcripts.** The Stats panel keeps reading the cumulative
cache after the underlying transcripts are gone, so it covers a longer period than any
transcript parser can see. On the same machine the cache reached back to June while the
oldest surviving transcript was early July.
That second one is a real limitation, not a bug: a number derived from logs cannot include
logs that no longer exist. The cache is not a usable substitute, because it carries the
inflation described above and the factor varies day to day — between 1.15x and 2.18x on the
days measured — so there is no constant to divide out.
It exists only for Claude Code. Codex and OpenCode have no equivalent cache, so a total that
mixed one inflated agent with two honest ones would be incoherent, and on the board someone
whose cache happened to survive would outrank someone whose did not, for identical work.
It would fail this project's own validation. Submissions are bounded by cost per token, with a
floor at the cheapest cache-read rate any model offers. Roughly doubling the tokens while the
cost stays real pushes that ratio below the floor, and the payload is rejected.
What *is* reported is the coverage gap, because it can be stated exactly: `sync` prints how
many days of transcripts are on disk against how many days the cache remembers.
And there is one correction that can be made honestly. On days where both sources exist, the
cache's figure divided by the deduplicated figure is how much *this machine's* cache
overstates. Apply that median ratio to the days only the cache has, and the result estimates
what the deleted transcripts held — derived from the machine's own overlap rather than from a
constant:
```
    its panel  27.8B
    this       10.7B  claude-code only
    days       41 of 98
    estimate   ~14.4B  including 35 deleted days, at this machine's own 1.87x overlap
               per-day ratios ranged 1.04x to 4.92x, so treat it as a range
```
Days that cannot calibrate are excluded rather than averaged in: a ratio below 1 means the
cache lagged, and a very large one means that day's transcripts are already partly rotated, so
it measures the loss being estimated rather than the inflation. Without at least five
calibratable days there is no estimate at all — silence beats a guess.

## Publishing to the board

`publish` is the **only** command that sends anything anywhere. `sync` and `recap` are local
forever, and there is deliberately no config switch to change that: `.tokenchit.json` is a
committed file, and a committed file must never be able to cause a network call on somebody
else's machine.

`--dry-run` prints the exact bytes that would be uploaded — the same string, not a rendering
of it, which `dryrun.exact` in the test suite enforces by comparing against what a real
publish puts on the wire. The payload is aggregates only: totals, per-day token counts, agent
and model ids. No prompts, no replies, no branch names, no paths.


### How the board ranks

Verified rows first, then tokens over the selected window.

Signing in is the only thing that ties a row to a GitHub account, so it is the only thing that
can carry a position. An unverified row still appears and still shows its figures; it simply
cannot outrank a verified one. A `tier` that is displayed but never affects the ordering is
decoration — it told you nothing about the ranking you were reading.

Submissions far outside the range of real usage are **held for review**: stored, returned to
their owner, and kept off the board until a person looks. The threshold is half the hard
rejection limit — about 1.6x the busiest day in the corpus these figures were measured
against — and `publish` says so out loud rather than leaving someone refreshing a board they
will never appear on.

The `flagged` column has existed since the first migration and, until this was added, nothing
ever wrote to it. The board query already refused to show flagged rows; there was simply no
code path that could set one.

## Signing in

```
$ tokenchit login
  Open  https://github.com/login/device
  Code  WDJB-MJHT
  opened your browser, copied the code — the code should already be filled in
✓ signed in as @octocat
```

GitHub's **device flow** — no password, no token to paste, and no localhost callback server,
which matters because the usual OAuth-in-a-CLI approach breaks over SSH, in containers and on
remote dev boxes: exactly where people run coding agents.

**Why not the redirect flow.** GitHub requires a `client_secret` at the token exchange even
with PKCE, which it added in July 2025 — it does not distinguish public from confidential
clients. Shipping that flow in a public npm package would mean publishing the secret. GitHub's
own `gh` reaches for a localhost callback only as a fallback for Enterprise hosts without
device flow, and embeds a secret to do it.

**The code is copied and the page is opened with it pre-filled**, so there is nothing to
retype. Both are conveniences layered over output that stands on its own: the URL and the code
are printed first, and stay correct when a container has no clipboard tool or `xdg-open` opens
a window nobody is looking at. `--no-clipboard` and `--no-browser` turn them off; neither runs
without a TTY.

The code is always shown, even when the page is pre-filled. RFC 8628 §3.3.1 requires it, and
§5.4 explains why: confirming the code is how you know the device asking for access is the one
in front of you.

GitHub does not return `verification_uri_complete`, so the pre-filled URL uses a `user_code`
query parameter the verification page accepts but does not document. That is why it is used
for the browser launch only, and never printed in place of the URL GitHub actually sent.

**No scopes are requested.** GitHub answers `GET /user` for an unscoped token, and your login
and numeric id are all we need.

The GitHub token is handed to the server **once**, so that the server — not the client — is
what asks GitHub who you are; a client that simply asserted `{"handle": "octocat"}` would be
forgeable. It is then discarded, never written to disk on either side. What you keep is a
tokenchit API key in `~/.config/tokenchit/auth.json`, mode `0600`, stored server-side only as
a SHA-256 hash. Never in `.tokenchit.json`, which is committed.

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

npx @tokenchit/cli login   --api http://localhost:3000
npx @tokenchit/cli publish --api http://localhost:3000
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

## The site

| route | what it is |
| --- | --- |
| `/` | the pitch, with a live card preview and a board teaser |
| `/board` | the full ranking, with headline totals, over any of four windows |
| `/u/<handle>` | one developer: contribution graph, agent split, model breakdown, their card |
| `/api/card/<handle>.svg` | the card endpoint |
| `/api/submissions` | publish (POST) and read the board (GET) |

**The site is measured; the CLI is not.** Page views and one copy event go to Firebase
Analytics from tokenchit.app — not from previews, not from localhost. The privacy
guarantees in `packages/cli/test/privacy.test.js` are about the CLI, which makes exactly one
network call, to publish, and carries no analytics of any kind. Saying so here rather than
leaving someone to find a Google request in devtools and wonder what else is unstated.

The Firebase web config in `apps/site/lib/firebase.ts` is checked in on purpose: it is
shipped to every browser that loads the page, and Google documents the API key as a project
identifier rather than a credential.

Every column on the board and the profile is summed over the same window, which is why
`user_days` carries an agent and a cost per day. Streak is the exception and is not windowed:
it is a current-streak count, and "your streak, but only counting last week" is not a thing
anyone means.

Profile pages are shareable, so they carry a PNG `og:image` rendered from the same figures —
`og:image` is deliberately **not** set in `generateMetadata`, because doing so overrides the
file-based `opengraph-image` convention and the page would then advertise the SVG card, which
Twitter, Slack and Facebook all decline to render.

## Releasing

CI runs on every pull request: build and tests on Node 22 **and** 24 (the OpenCode adapter
uses `node:sqlite`, experimental on 22 and stable on 24 — the place they are most likely to
disagree), plus lint, the standalone site build Vercel performs, and an install of the packed
tarballs, because the tarball is a different artifact from the working tree.

**One published package.** `@tokenchit/core` stays a workspace package — it is what keeps
the site and the CLI rendering the same card — but it is `private` and esbuild inlines it
into the CLI's single bundled file. Publishing a second package would mean maintaining a
public API surface nobody has asked for, and every rename inside it would become a
compatibility decision for strangers. Publishing core later is easy; unpublishing is not.

**Publishing is version-driven.** The release workflow runs on every push to `main` but
publishes only when `packages/cli/package.json` names a version npm does not already have.
Bumping the version is the release:

```bash
npm run version:set 0.2.0   # both packages, and the dependency between them
npm install
git commit -am "Release v0.2.0"
git push
```

CI then builds, tests, lints, creates the `v0.2.0` tag and publishes. Merging anything that
leaves the version field alone publishes nothing, which is most merges — docs, the site, a
dependency bump.

This keeps what a tag-only trigger was protecting. An unpublished npm name can never be
reused by anyone, so releasing has to be deliberate; it is now an explicit edit to a version
field rather than an explicit tag. What it removes is the failure mode where the bump lands
and the tag never gets pushed, so a fix sits on `main` for a week believing it shipped.

The registry, not the tag, is the source of truth: the workflow asks npm whether that exact
version exists, so a re-run, a revert, or a manually pushed tag all stop quietly instead of
failing over work already done. Tests run before the tag is created, because a tag pointing
at a commit that does not build is worse than no tag.

It attaches npm provenance so the package carries a signed link back to the commit that
produced it. CI
installs the packed tarball into an empty project on every pull request and asserts nothing
but `@tokenchit/cli` lands, which is what stops the bundle silently regressing into a broken
dependency on the private package.

Requires an `NPM_TOKEN` repository secret with publish rights.

## The hosted endpoint

`apps/site` also serves `GET /api/card/<handle>.svg` with `layout`, `theme`, `agents`, `hide`
and `cache` parameters. It renders sample data and exists to demonstrate the builder. The
supported path is the committed SVG: it costs nothing to run, cannot be abused, and — unlike
an external image — GitHub serves it directly rather than through its camo proxy.

Measured on a live public repository rather than assumed:

| in a README | rendered as | proxied |
| --- | --- | --- |
| committed SVG, relative `./card.svg` | `/owner/repo/raw/main/card.svg` | no |
| committed SVG, absolute `raw.githubusercontent.com` | unchanged | no |
| any external image | `camo.githubusercontent.com/…` | yes |
| this project's own `/api/card/…` endpoint | `camo.githubusercontent.com/…` | yes |

Both committed forms work, so `sync` printing a relative path costs nothing. The `<style>`
block survives too — a committed `theme=auto` card really does follow GitHub's dark mode,
which the original design brief assumed was impossible.
