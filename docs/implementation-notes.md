# Implementation notes — recap enrichment and beyond

A resumable record of the staged work described in the September 2026 implementation brief.
Each stage is a reviewable unit: it is either done and verified, or it is not started.

**Repository state at start:** `d17b93a`, working tree clean.
**Code-review graph:** empty (0 nodes, 0 edges, 0 files) at session start, so this work used
targeted reads and searches rather than graph queries.

---

## Status

| Stage | State |
| --- | --- |
| 1 — Enrich the existing recap | **Done and verified** |
| 2 — Validated Gemini CLI support | **Done and verified** |
| 3 — Read-only data-health diagnostics (`doctor`) | **Done and verified** |
| 4 — Local sharing pack (PNG export) | **Done and verified** |
| 5 — Portable history and multi-device merge | **Done and verified** |

---

## Stage 1 — what shipped

### The problem underneath it

Three different kinds of observation were flowing through one `UsageEvent.ts` field and being
counted as the same evidence:

- **Claude Code, OpenCode** stamp each exchange. Exact.
- **Codex** reports a running counter, so one rollout contributes a single event dated at its
  *last turn*. The day is right; the hour is only the hour it finished.
- **Ledger replay** stores a day and synthesises **local noon** to put it back.

`byHour`, `byWeekday` and `heat` counted all three. That was a knowing trade for the heatmap —
`ledger.ts` says so: "a wrong hour is a much smaller lie than a missing fortnight". It is not an
acceptable trade for a *new* claim about when somebody works, and the brief forbids it.

### The design

`UsageEvent` gained an optional `tsPrecision: "exact" | "session" | "day"`. Absent means
`exact`, so every existing producer and consumer is unchanged. `Stats` gained parallel
**observed-clock** series:

- `clockByHour`, `clockByWeekday`, `clockTokens` — built only from events with a real clock
- `byHour`, `byWeekday`, `heat` — **unchanged**, still counting everything

Keeping both was deliberate. Dropping replays from the heatmap would empty it for anyone whose
logs have rotated, and an emptier map is its own lie. So the heatmap keeps its existing trade,
and the peak headline and time-of-day badges read the observed series instead.

The persisted ledger format is untouched: the tag lives on in-memory events only, and buckets
remain four-number tuples.

### Significant tradeoffs

**`Recap.peak` changed meaning.** It now reads `clockByHour` rather than `byHour`. This is a
behaviour change to an existing field, made deliberately because the brief requires it: a
mostly-recovered history previously produced a confident "peak 12:00–13:00" that was an
artefact of this tool's own replay. `peakCoverage` (0–1) reports how much of the total the
window actually saw, and the CLI prints it whenever it is below 100%. When *no* day has an
observed clock, `peak` is `null` and the CLI explains why rather than inventing a window.

**`--week` / `--month` write no SVG.** The recap card is a year card: a weekday-by-hour grid
with annual tiles. Seven days rendered into it reads as a quiet year, not a short window. Both
flags print to the terminal and to `--json`. A card designed for a short period is separate work.

**`--week` / `--month` scan unscoped by year.** A completed week in early January reaches back
into December; a year filter would truncate the baseline to zero and report it as a collapse.

**Comparability is a first-class result, not a missing number.** `deltaPct` is `null` — never
zero, never infinity — whenever the previous period cannot support a rate, and
`comparability.detail` says why in the user's terms. Four distinct cases:

| Case | `reason` |
| --- | --- |
| No history at all | `no-baseline` |
| History starts *inside* the prior period | `partial-baseline` |
| Prior period predates history but the logs still show figures | `partial-baseline` |
| Prior period fully covered and genuinely empty | `no-baseline` |

That third case matters in practice. On this machine `recap --month` shows **+8.50B** against
July — which as a percentage would have read as roughly +3500% growth. The real cause is that
July predates the ledger's `since`. The absolute change is still reported; the rate is not.

### Badges

Five, all deterministic, all from existing `Stats`, none using an LLM or inferring sessions:

| Badge | Threshold | Minimum data |
| --- | --- | --- |
| Night Owl | ≥25% of **observed** tokens in 22:00–05:00 | 100k observed tokens |
| Weekend Zombie | ≥35% of observed tokens Sat/Sun (a flat week is ≈28.6%) | 100k observed + 14 active days |
| Agent Explorer | ≥2 agents each above 10% of tokens | — |
| No Days Off | current streak ≥14 days | — |
| Steady Hand | busiest day ≤2.5× an even spread | 14 active days |

Deliberately absent: spending milestones, volume trophies, population percentiles, session
inference. This project's own position is that the card measures usage rather than output and
cannot tell work from a retry loop, so a badge celebrating a bigger number would argue against
the product. **Steady Hand is the counterweight** — the one badge a heavier user is *less*
likely to earn, because it describes even distribution rather than volume.

Time-of-day badges read the observed series only, so a replayed day can never earn one. A test
asserts exactly that.

### Ties and determinism

`biggestDay` keeps the **earlier** day on a tie, so identical input always produces an
identical headline. Tested by feeding the same events in both orders.

### Verification

- `npm test` — 108 core / 33 CLI / 23 MCP / 4 site, all passing.
- 27 tests added across `aggregate`, `recap` and a new `period` suite, covering: month rollup
  and year scoping; biggest day and tie stability; replayed days excluded from observed clocks;
  peak null when nothing was observed; badges suppressed below minimum data; no badge naming
  volume; week and month boundaries on Mondays, Sundays and month ends; **leap years**
  (2028-02-29 vs 2026-02-28); **DST weeks** (late March and late October still span 7 days);
  and all four comparability cases.
- Run against real local logs: `recap`, `recap --week`, `recap --month`, `--json`, and the
  conflicting-flag rejection. Annual SVG still renders (17,933 bytes).

### Known limitations

- Per-period **cost** is not reported. The day series carries tokens, not cost, so a per-period
  equivalent-cost split would need day-level cost accounting. Rather than approximate it,
  `PeriodReport` omits cost entirely.
- `historyFrom` defaults to the ledger's `since`. If a user deletes the ledger, comparisons
  become conservative again until it rebuilds — correct, but it will surprise someone.
- The site's recap component has not been updated to show months, biggest day or badges. The
  data flows through `buildRecap`, so it is available; only the presentation is outstanding.
- MCP `get_recap` returns the enriched object automatically (it serialises `buildRecap`'s
  result), but its tool description does not yet mention the new fields.
- README and `recap` long-form docs describe the new flags via `tokenchit help recap`; the
  README itself has not been updated.


---

## Stage 3 — `tokenchit doctor`

### What it does

One command answering "why does this number look wrong". The explanations already existed but
were spread across three commands — `sync` warns about recovered days and price coverage,
`init` lists detected and unsupported agents, `ledger` shows the bank — so nobody saw the whole
picture at once, which is exactly what a discrepancy report needs.

Reports: recognised agents with detection state and source glob, observed date bounds, retained
history and what it restored this run, price coverage with the unpriced models named, and the
accounting limitations that **actually apply to this machine** rather than a static list.

`--json` emits a versioned object (`version: 1`).

### Read-only is a contract, not an intention

`scan({ write: false })` never calls `writeLedger`, and the OpenCode adapter already opens its
SQLite database with `readOnly: true`, so no `-wal` or `-shm` sidecar appears. No existing
helper needed changing — the read-only path was already there.

Tests assert this rather than assuming it, by **content fingerprint** over the fixture home and
the config directory before and after. The fingerprint deliberately hashes contents and names
only, never mtime or atime: reading a file updates its access time on many systems, and a test
treating that as a write would fail a command behaving perfectly. Separate tests assert no
sidecar/temp/lock file appears anywhere, and that a machine with no ledger still has none
afterwards.

### Deliberate omissions

- **No completeness percentage.** Observed bounds do not prove the days between them are
  complete: a silent day and a day whose transcripts were deleted are indistinguishable from
  here. A test asserts the `observed` object carries no key matching `complete|coverage|percent`.
- **No remediation.** Suggestions are printed for the user to run. Nothing is applied, no
  config is repaired, no hook installed, no credential refreshed.
- **Exit code 0 for an empty machine.** A fresh install with no usage is a correct state to be
  in, not a failure.

### Limitations

- Source *globs* appear in the output by design — that is documentation of where an adapter
  looks, not a path harvested from the user. A test asserts no transcript content or project
  path leaks.
- `doctor` runs a full scan, so on a large corpus it takes as long as `sync` does. It has no
  cheaper detection-only mode.


---

## Stage 2 — Gemini CLI: verified findings, adapter not yet written

The research was treated as dated evidence and re-checked against real recordings on this
machine before any parser was designed. Two things it said needed correcting, and the
accounting question it flagged now has a measured answer.

### What is actually on disk

`~/.gemini/tmp/<project>/chats/session-*.jsonl`, **2,141 files** on this machine.

Two distinct record shapes are present:

1. **The common shape (2,139 files).** JSONL lines carrying `sessionId`, `projectHash`,
   `startTime`, `lastUpdated`, `kind` and a `$set` envelope whose `messages[]` have only
   `id`, `timestamp`, `type`, `content`. **No token fields at any depth.**
2. **The token-bearing shape (2 files, 46 records).** JSONL lines with a top-level `tokens`
   object alongside `id`, `timestamp`, `type`, `model`, `content`, `thoughts`.

So the current `unsupported.ts` reason is **not simply stale** — it is accurate for the
overwhelming majority of what this installation has written. The right description is a
*partial* state: newer recordings are countable, older ones are not, and an installed client
with uncountable sessions is a partial/unavailable state rather than a fabricated zero.

### The accounting answer — measured, not assumed

The token object is always exactly:

```
{ input, output, cached, thoughts, tool, total }
```

Four hypotheses were tested against all 46 records:

| Hypothesis for `total` | Matches |
| --- | --- |
| `input + output + cached + thoughts + tool` (all disjoint) | **9 / 46** |
| `input + output + thoughts + tool` (cached **inside** input) | **46 / 46** |
| `input + output + tool` (cached and thoughts inside) | 0 / 46 |
| `input + output` (everything else inside) | 0 / 46 |

**`cached` is nested inside `input`** — the same shape Codex uses for `cached_input_tokens`.
The first hypothesis appears to work only on the 9 records where `cached == 0`, which is
exactly the trap the brief warns about: sampling one zero-cache record would have "confirmed"
the wrong model.

Worked example: `{input: 8684, output: 52, cached: 7061, thoughts: 40, tool: 0, total: 8776}`.
Summing all five fields gives 15,837 against a reported total of 8,776 — an **80% inflation**
on a cache-heavy turn.

### The mapping this implies

To keep tokenchit's four buckets disjoint and reconcile exactly with Gemini's own total:

| tokenchit bucket | from Gemini |
| --- | --- |
| `input` | `input - cached` |
| `cacheRead` | `cached` |
| `output` | `output + thoughts + tool` |
| `cacheWrite` | `0` (Gemini reports none) |

This sums to `input + output + thoughts + tool`, which equals `total` on all 46 records. The
reported `total` should be used as **reconciliation evidence** — parse the components, then
assert they agree with `total`, and represent a disagreement explicitly rather than forcing it.

`thoughts` (reasoning) and `tool` are folded into `output` because both are generated tokens.
That is a judgement, not a measurement: it is the placement that preserves the disjoint-bucket
invariant and matches how these are billed, but a future pricing table distinguishing reasoning
rates would want them separated.

### Privacy note for the implementation

These files carry `projectHash` and a `content` field with full prompt and reply text. Neither
may be collected: the brief puts hashed and truncated paths outside the contract, and `content`
is raw transcript. Only `timestamp`, `model` and the `tokens` object may be read. Fixtures must
be synthetic, never copied from `~/.gemini`.

### What shipped

`packages/core/src/adapters/gemini.ts`, registered as a fourth real adapter. `AgentId` widened;
`unsupported.ts` no longer lists Gemini. The blast radius was smaller than feared — `validate.ts`
treats agents as bounded free-form strings rather than an enum, and the site stores `agent text`,
so only the TS union, the icon/colour table and the board filter needed touching.

**Reconciliation against real data.** Run against this machine's `~/.gemini`: 46 records,
**1,606,888 tokens**, matching the sum of Gemini's own reported `total` fields **exactly**. The
naive five-field reading gives 2,847,359 — **1.77× the truth**. Two consecutive scans are
identical.

**Detection is three-state on purpose.** `ready` only once a *countable* turn has been found;
`installed-no-data` when `~/.gemini` exists but nothing readable does — which is the real state
for an installation whose recordings all predate token recording. A user with years of older
sessions is told that rather than shown a confident zero.

**A bug found while wiring it.** `detect()` consulted the real `~/.gemini` even when a caller
passed an explicit root, so a non-existent test path reported `installed-no-data` purely because
this machine has Gemini installed. An explicitly-named root is now self-contained.

**A second bug found.** `packages/mcp/src/tools.ts` carried a *hardcoded copy* of the unsupported
list and had already drifted — it still called Gemini uncountable after Gemini became a real
adapter. It now sources the probes, so the one tool whose job is explaining what cannot be
counted cannot drift again.

**Agent colour was computed, not chosen.** The obvious Google blues both failed the table's
luminance-separation rule: `#4285F4` lands 0.007 from the neutral and `#1A73E8` 0.020 from
opencode, either of which would merge with a neighbour in greyscale. `#174EA6` (light, 0.084)
sits in the gap between codex and opencode; `#8AB4F8` (dark, 0.448) is 0.162 clear.

### Limitations

- Gemini models are priced from the same vendored table as every other agent, long-prompt tier
  included. An id the table does not know contributes tokens and no cost — the designed
  behaviour for an unknown model, not a gap to paper over.
- `thoughts` and `tool` are folded into `output`. A pricing table distinguishing reasoning rates
  would want them separate.
- A turn with no `id` cannot be deduplicated and is kept under a synthetic key: losing real usage
  is worse than a small risk of double-counting a record the format does not let us identify.

## Stage 4 — local PNG export

### What the SVG is for, and what the PNG is not

The SVG stays the artifact this tool argues for: a committed file GitHub serves directly, sharp
at any size, a few kilobytes, and diffable. The PNG exists only for the places that will not
take one — a social feed, a slide, a chat window. It is therefore **written beside the SVG,
never instead of it**: `--png` adds an output rather than replacing the one that belongs in a
README, and the closing hints name the two separately so nobody embeds the raster copy by
mistake.

### Three things it deliberately is not

- **Not a screenshot.** No browser, no headless Chrome, no hosted renderer. `@resvg/resvg-js`
  rasterises the SVG this package already produces, in-process.
- **Not networked.** Nothing is fetched while rendering. The card names font *stacks* rather
  than one face — precisely because GitHub strips webfont references from README SVGs — so
  there is nothing to load, and no image is referenced by URL. `loadSystemFonts` resolves the
  same stack a browser on the same machine would.
- **Not an editor.** Three presets and the existing `hide`/`layout`/`theme` concepts. Anyone
  wanting pixel control has the SVG.

### The rasteriser is optional, and that is load-bearing

`@resvg/resvg-js` is a native module with per-platform prebuilt binaries. As a hard dependency
it would make `npm i -g tokenchit` fail on any machine with no prebuild and no toolchain — for
a feature most users never touch. It is an `optionalDependency`, imported lazily *inside*
`toPng`, so `sync`, `publish`, `recap`, `doctor` and the MCP server never load it. A machine
that cannot build it has a fully working CLI that simply cannot write a PNG, and is told so in
a sentence naming the fix rather than by a native-module stack trace.

This required `--external:@resvg/resvg-js` in the CLI's esbuild step: bundling a native module
fails outright, and the bundle must be able to *try* the import and fail softly at runtime.

### Presets frame rather than re-render

| Preset | Shape | Why |
| --- | --- | --- |
| `card` | the card's own 495×195, scaled | the default; nothing added |
| `square` | 1:1 | feeds that crop to a square would otherwise eat the card's own edges |
| `portrait` | 4:5 | the tallest most feeds show uncropped |

A preset nests the card's SVG **untouched** inside a padded canvas (SVG 1.1 `<svg>` nesting,
which resvg supports) rather than re-rendering it at a new size. A preset therefore cannot
change what the card says or how it is laid out — it only decides how much space surrounds it.
The framing axis only ever grows, never shrinks, so no preset can crop the card.

`--scale` is clamped to 1–6: below 1 the text stops being legible, above 6 the file is large for
no gain. A non-finite value falls back to 2 rather than throwing, because `--scale` is a quality
knob and a broken one should not fail a card that would otherwise have been written.

### `recap --png` and the period views

`recap --png` writes the year card the same way. `--week`/`--month` **reject** `--png` with a
message rather than ignoring it: those views write no SVG at all, so there is nothing to
rasterise, and silently producing no file for a flag the user typed reads as a broken export.

### Verified

Real PNGs generated and inspected at all three presets (card 990×390, square 1182×1182,
portrait 591×739 for the usage card; 1182×1478 for the taller recap card). Scale clamping
checked at the edges — `99` → 6×, `0.01` → 1×, `NaN` → 2×. A bad `--preset` is rejected by name.
The PNG test skips itself, rather than failing, where the optional rasteriser is absent.

### Limitations

- No hosted image endpoint and no Open Graph card. Both are network features; this stage is
  local-only by design.
- Fonts resolve against the rendering machine, so a PNG made on a machine with different fonts
  installed will differ slightly. The SVG has the same property in browsers and this is the
  behaviour that keeps rendering offline.

## Stage 5 — portable history: the accounting design

Written before any mutation code, because the whole difficulty of this stage is the arithmetic
and not the file format.

### The problem the current ledger cannot solve

Ledger v1 stores `day -> agent -> model -> Bucket` and keeps the **fullest** reading per cell.
That is the right rule for one machine reading its own thinning logs, and it says nothing at
all about two machines. Given day `D` where laptop reports 1M and desktop reports 1M:

- **Max-wins** answers 1M. Correct if the two are the same work seen twice; wrong by half if
  they are genuinely different work.
- **Addition** answers 2M. Correct if independent; wrong by double if somebody copied a home
  directory, restored a backup, or migrated logs to a new machine.

A day total carries no evidence for choosing. And a machine identifier is not evidence either:
the brief is explicit that a different machine ID does not prove different underlying usage,
because people copy home directories. Any design resting on "these came from different devices,
so add them" is guessing.

### What *is* evidence: the agents' own session identities

Every supported agent stamps its own records with an identifier that travels with the data
rather than with the machine:

| Agent | Identity | Where |
| --- | --- | --- |
| Claude Code | `sessionId` | on every transcript row |
| Codex | `payload.session_id` | the `session_meta` row of each rollout |
| Gemini CLI | `sessionId` | the session header row of each chat recording |
| OpenCode | `sessionID`, else the message `id` | the message JSON blob |

These are random identifiers minted by the agent. Copy a home directory and they come with it;
work on two machines and they differ. That is precisely the distinction a day total loses, and
it is device-independent — which is the identity the brief says to prefer where a valid one
exists.

**So the merge unit is `(day, agent, model, source)`, not `(day, agent, model)`.**

### The rules, stated so they can be checked

Ledger v2 stores each cell as `s: { sourceDigest -> Bucket }`.

1. **Within one source digest: max-wins on the whole four-tuple.** Two readings of one session
   are two observations of one thing; the fuller one is the truer one. This is v1's rule,
   applied at the level where it is actually justified. It is what makes a corrected record
   correct rather than additive.
2. **Across distinct source digests: addition.** Not arbitrary addition — addition over
   observations the agents themselves certify as distinct pieces of work.
3. **Repeated import is therefore idempotent by construction**, not by a deduplication pass
   that has to be trusted. Importing the same file twice unions the same keys.

`sum` and `max` each appear exactly once, at the level where each is provable. Neither is used
to paper over a case we could not decide.

### Usage with no source identity

Two things produce it: a v1 ledger being migrated (no identities were ever recorded), and any
record an adapter cannot attribute. It lives in a second map on the cell,
`u: { originId -> Bucket }`, holding **the fullest whole-cell total that origin ever observed**
— which is exactly what a v1 ledger entry was. One rule governs it:

> **An unidentified reading is a floor under the identified sum, never an addend, and never
> merged across origins.**

    cell total for this machine = max( Σ identified sessions , u[this origin] )

- The max is between two *readings of the same logs* — the aggregate and the identified detail
  — so taking the larger is right whichever of the two is more complete. As identified coverage
  grows it overtakes the legacy figure; as retention eats the transcripts the floor holds the
  line. Both directions are correct without a special case.
- A foreign origin's floor is **preserved verbatim, never discarded, and never added.** It is
  reported with its origin, date range and token count by `ledger`, `doctor` and every import
  preview, and the import says in words why it is not in the headline.

**This rule was corrected during implementation, and the correction matters.** The first
version *added* `u` to the identified sum, on the reasoning that the two were complementary
halves of a cell. They are not: they are two readings of the same logs. The bug surfaced on a
real ledger. Five OpenCode cells had been banked once with no identity, and then again *with*
one after the adapter learned that OpenCode keeps its session id in a table column rather than
in the JSON blob — so the same 17.6M of work sat in both maps. Across the whole machine the
additive rule reported **28.46B against a true 15.08B — a 1.89× overcount**, and the totals
looked plausible the entire time. The max rule reports 15.08B and loses nothing: every token of
the original v1 ledger's 15,069,291,399 is still there.

One consequence had to be handled explicitly. If a floor held only the *unidentified remainder*
of a mixed cell — some events attributed, some not — the max would report the identified part
alone and silently drop the rest. So `recordAndReplay` files the **whole cell's** live total as
the floor whenever anything in it was unattributable, and emits no floor at all when the cell is
wholly identified. There is a test for exactly this.

That is the brief's "preserve it as an identified archive" branch. The rejection branch — an
import refused outright with an actionable diagnostic — is reserved for exports that fail
validation or declare an incompatible accounting version, and is a supported outcome rather
than a failure.

A consequence worth stating plainly: importing a machine whose history has no session
identities changes no total at all. The import is still worth applying, and still writes,
because storing that history is the difference between keeping it and dropping it. Gating the
write on the totals alone was a real bug — it printed "nothing to do" and then stored nothing,
which is discarding the data quietly, the one thing this design promised not to do.

### `origin` is a label, not a fingerprint

A random identifier minted once when the ledger is created. Not a hostname, not a MAC address,
not a username, not a path, not derived from any of them — those would be device fingerprints
and are outside this tool's contract. Its only job is to keep one machine's unattributable
archive distinct from another's.

It travels with the file, which is the conservative behaviour: copying `~/.config/tokenchit`
to a new machine carries the origin along, so the two ledgers' archives max-merge as one
lineage instead of summing as two. A copied home directory therefore cannot inflate a total
even through the unattributable path.

### Digests, and why they are truncated

A source identity is stored as the first 12 hex characters of the SHA-256 of `agent + "\0" +
sessionId` — 48 bits. Unsalted, because two machines must derive the same digest from the same
session or the whole scheme fails.

Truncation trades a collision risk for size: two distinct sessions colliding would merge into
one cell and *under*count. At 48 bits the birthday bound is around 16 million entries; a heavy
ledger holds thousands. Hashing rather than storing the raw UUID keeps the export from carrying
an identifier that could be cross-referenced against the log filenames on someone's disk, and
costs nothing, since the digest is only ever compared for equality.

### Timezones and date-only data

The ledger banks **local** calendar days and keeps no clock, so a day's boundary was fixed by
the exporting machine's zone at the time it scanned. That cannot be undone after the fact: no
instant survives to re-bin.

The export therefore records the exporting machine's IANA zone, and an import into a different
zone **warns rather than adjusts**. Totals are unaffected — every token is still counted
exactly once — but work done near midnight may be attributed to the adjacent day. Silently
shifting days would invent precision the data does not have; refusing the import would discard
real history over a known and bounded imprecision.

### Concurrency, atomicity and recovery

- Export and preview open the ledger read-only and write nothing to it. Ever.
- An apply takes an exclusive lock file beside the ledger, re-reads the live ledger *inside*
  the lock, and re-derives the merge against that fresh state — so an import cannot overwrite a
  scan that landed while the operator was reading the preview.
- `scan`'s own write takes the same lock, so the two serialise rather than interleave.
- The previous ledger is copied to `ledger.backup.json` before the new one is renamed into
  place. An interrupted apply leaves either the old file or the old file plus a temporary; the
  rename is the only atomic step and it happens last.

### Acceptance cases and the rule that decides each

| Case | Decided by | Outcome |
| --- | --- | --- |
| Repeated import | rule 3 | second import is a no-op; preview says so |
| Independent machines, overlapping dates | rule 2 | summed over disjoint digests |
| Copied logs / home directory | rule 1 | identical digests collapse; no double count |
| Device migration | rule 1 | same |
| Corrected records | rule 1 | fuller reading wins within the digest |
| Interrupted import | atomicity | live ledger unchanged; backup intact |
| Concurrent scan | lock + re-read | merge re-derived against fresh state |
| Incompatible export | validation | refused, naming the version and the fix |
| Timezone change | documented | imported, warned, totals unaffected |
| Legacy ledger with no identity | the floor rule | held under its origin, reported, not summed |

### Explicitly out of scope

No cloud sync service, no automatic remote collection, no background upload. `export` writes a
file the user chooses; `import` reads one the user names. Nothing else moves.

### What shipped

- `packages/core/src/ledger.ts` — ledger v2. `Cell = { s: {digest -> Bucket}, u?: {origin ->
  Bucket} }`, plus `origin` (a random label, never a device fingerprint) and `tz`. v1 files are
  migrated on read into this origin's floor, so nothing is lost and no command needs a flag.
- `packages/core/src/portable.ts` — the export envelope, full validation, and `mergeExport`,
  which is **pure**: the preview a user reads and the merge an apply performs are the same
  function, so a forecast cannot disagree with the outcome by more than what landed in between.
- `sourceId` on `UsageEvent`, populated by all four adapters from the agents' own session ids:
  `sessionId` on a Claude Code row, `session_meta.session_id` in a Codex rollout, `sessionId` in
  a Gemini recording header, and `message.session_id` in OpenCode's SQLite table.
- `withLedgerLock` and `commitLedger`. A scan no longer writes back the copy it started with; it
  replays its banking decisions against a ledger re-read inside the lock, so an import landing
  during a multi-second log walk is merged rather than erased.
- `tokenchit ledger --export/--import/--apply`, and held history surfaced in `ledger` and
  `doctor` (terminal and `--json`).

**An adapter bug this stage found.** OpenCode's message identity is in the *table columns*
(`session_id`, `id`), not in the `data` blob — the blob carries agent, mode, model, cost, timing
and tokens and no id of any kind. Reading only `data` left every OpenCode day unattributable:
real usage, banked where it could never be told apart from a copy of itself. Fixed; OpenCode now
contributes 19 identified sessions on this machine where it previously contributed none.

**A source-file hazard found and fixed.** Several files had been written with a literal NUL byte
where the `\u0000` escape was intended. It worked, and it was invisible in an editor and
un-greppable. All occurrences are now escapes.

### Verified

- All ten acceptance cases have a test each, plus mutual exclusion of the lock, purity of export
  and merge, and the privacy contract of the envelope. 144 core tests green, three consecutive
  full runs.
- Migration of the real 59-day / 15,069,291,399-token v1 ledger on this machine: **not one
  token lost**, before or after a subsequent `sync`.
- Two synthetic machines end to end through the CLI: one shared session and one unique session
  each merges to 3.50M rather than the 4.50M naive addition would give; re-applying is a no-op;
  the backup is written; every refusal path (bad accounting version, newer envelope, malformed
  day key, unparseable JSON, missing file) exits 1 and leaves the ledger byte-identical.

### Limitations

- A session digest is 48 bits. Two distinct sessions colliding would merge and *under*count. The
  birthday bound is around 16 million entries against a few thousand in a heavy ledger.
- Timezones are reported, never corrected. The ledger keeps no clock, so a day binned in another
  zone cannot be re-binned after the fact; a session the exporting machine filed under a
  different date is counted once, on this machine's date, and the difference is stated.
- History with no session identities can never be merged. That is the design working, not a gap
  — but it means two machines both running a pre-identity version have to upgrade and re-scan
  before their overlapping days can be combined.
- The lock is advisory and file-based. A process killed mid-commit leaves a stale lock that is
  taken over after 60 seconds rather than blocking forever.
- **Downgrading is not safe, and nothing can make it so.** A v1 build reads a v2 ledger as
  unrecognised, falls back to an empty bank and then overwrites the file from whatever logs are
  still on disk — so history the transcripts no longer hold is lost. Upgrading is lossless in
  both directions of use; going back a version is not. Anyone who needs a way out should
  `--export` first, which is a file no version of this tool will overwrite.
- No cloud sync, no automatic remote collection, no background upload. `export` writes a file the
  user names; `import` reads one the user names. Nothing else moves.

## QA pass — what a deliberate attempt to break it found

Run after all five stages were committed. Four defects, two of them serious. Each is fixed and
each has a regression test, because a fix without one is a fix with a shelf life.

### 1. Prototype pollution from a crafted import file (security)

`ledger --import` walks an untrusted tree and assigns into nested objects with `??=`. An agent
or model key of `__proto__` turned that assignment into a write to `Object.prototype`, poisoning
every object in the process rather than only the ledger. Day keys and session digests were
already saved by their format regexes; agent, model and origin keys were not.

Demonstrated with a raw JSON payload, which is the only way to demonstrate it: `{ "__proto__": x }`
written as an object *literal* sets the prototype instead of creating an own property, so a
literal-based test passes while the real attack still works.

Fixed in three places rather than one, because the tree arrives by three routes:

- **validation** refuses `__proto__`, `constructor` and `prototype` at every position that takes
  a key from the file;
- **`bank()`** refuses them too — it is the only function that creates the nested objects, and it
  is reached from imports, from scans *and* from a ledger read off disk;
- **`adopt()`** strips them from a v2 tree on read, so a hand-edited `ledger.json` is no vector
  either.

### 2. A session is not a cell (correctness, silent data loss)

Found by fuzzing multi-machine merges against an independently computed ground truth: 343 of 400
trials disagreed.

The merge treated a session digest as living at exactly one `(day, agent, model)`, keeping the
first cell it saw and dropping the rest. But a session legitimately occupies more than one cell
— it runs past midnight, or switches model mid-way. Importing a ledger containing any such
session lost the later cells outright, quietly, leaving a plausible total.

The merge now groups by session: a session is worth the **largest total any one machine
attributes to it**, and the day/model breakdown comes from that same machine. Both halves are
needed. Taking the max across machines is the "max within one source" rule applied at the level
where a source actually lives; taking the breakdown from the winning machine keeps the split
coherent, since mixing one machine's Monday figure with another's Tuesday figure would bank a
distribution neither ever observed.

Merging cell-by-cell *without* a home coordinate would have double-counted the timezone case
instead. Grouping by session is the only rule that is right for both.

Re-fuzzed after the fix: 600 trials, sessions deliberately spanning multiple days and models —
zero order-dependent results, zero disagreements with ground truth, zero non-idempotent
re-imports, zero cases losing pre-existing history.

### 3. The backup was world-readable (privacy)

`copyFile` creates its destination under the process umask, so `--apply` wrote a 0644 backup of
a deliberately 0600 ledger: the same record of when somebody works and how hard, republished to
every account on a shared box. Now written through a temporary file created at 0600 and renamed
into place, so the mode is right from the first byte.

This one is the clearest argument for the test file it produced. There was **no CLI-level
coverage of export/import at all** — the merge arithmetic was well tested in core, and
everything the CLI wrapped around it was not. `packages/cli/test/portable.test.js` now covers
permissions, the backup, preview-versus-apply, `--json`, and the promise that every refusal
leaves the ledger byte-identical.

### 4. `recap --week --month` picked one silently

`--week --year` refused; `--week --month` quietly reported the week. Now refused too.

### What the QA confirmed rather than broke

- **Period maths**: 140,256 boundary invariants across four years and eight timezones — including
  half-hour DST (Lord Howe), +12:45 (Chatham), southern-hemisphere DST (Santiago) and +14
  (Kiritimati). Zero failures. Weeks are always Mon–Sun and fully elapsed; months always span a
  real calendar month; periods are contiguous with no gap or overlap.
- **Gemini accounting**: 15 adversarial records plus 200,000 fuzzed ones — zero reconciliation
  failures. Re-verified against the real machine: 46 records, **1,606,888 tokens, matching
  Gemini's own reported totals exactly**, deterministic across scans, all 46 now carrying a
  session identity.
- **`doctor` is read-only**: the config directory is byte-identical after repeated runs, the
  ledger's mtime never moves, and no lock, temp or backup file is left behind.
- **The lock is real**: 12 concurrent OS processes writing 25 sessions each produced all 300
  with zero lost updates. A stale lock is taken over after 60s; a live one blocks and then
  refuses with a diagnostic after 10s.
- **Corrupt input degrades, never crashes**: truncated JSON, non-JSON, empty, `null`, an array,
  wrong-shaped buckets and a future version all read back as an empty ledger.
- **Privacy of a real export**: no absolute paths, no tilde paths, no file extensions, no emails,
  no URLs, no username. The only UUID in the file is the ledger's own random origin label, and
  none of the machine's real session ids appear — all six sampled are present only as digests.
- **Cross-command agreement**: `sync`, `recap`, `doctor` and `publish` all report
  15,130,848,662 tokens across 59 days. No drift.
- **PNG**: every preset and scale produces a structurally valid PNG with correct aspect ratios
  and every chunk CRC verified; non-numeric scales exit 1; no PNG is written without `--png`.
- **Rebuild under v2**: a scoped `--rebuild` clears the target agent's identified sessions *and*
  its unidentified floor, and leaves every other agent untouched.

## QA round two — fixing the classes, not the instances

The first pass fixed four defects. This pass asked a different question: for each of those four,
is the *class* closed, or only the instance I happened to find? It was not closed in any of
them. Six more defects, plus two found on an attack surface the first pass never touched.

### The four classes, audited

**Prototype pollution.** Closed in the import path, but `checkName` in `validate.ts` still let
`__proto__` into the board's database as an agent or model name. Every consumer in this repo
happens to be safe — core groups with `Map`, and the site's one dynamic assignment coerces with
`Number()`, which makes `__proto__ = <number>` a silent no-op — so it was latent rather than
live. It is refused at the ingest boundary now, which is where it belongs: the alternative is
relying on every future consumer to be careful.

**File permissions.** The backup was the instance; the class was "files with sensitive content
written under the umask". Three more: `auth.json` was written and *then* chmod'ed, leaving a
window in which a credential sat on disk world-readable — the exact race the ledger's own
comment warns against; `unpublish --export` wrote a full usage history at 0644 while
`ledger --export` wrote 0600; and the config directory holding both was 0755. All now 0600 at
create time, with the directory at 0700.

**Silently ignored flags.** `--week --month` was the instance. Four more: `sync --json --png`
and `recap --json --png` accepted a flag they could not honour, and `ledger --export a --import b`
silently dropped the import while `ledger --apply` alone did nothing at all. On the one command
that can destroy history, "I thought it had imported" is exactly the misunderstanding to refuse.
All rejected now, and `--dry-run --png` names the PNG it *would* write rather than listing one
of the two files it was asked for.

**A session is not a cell.** Audited and genuinely closed — `cellTotal` sums digests within a
cell, `recordAndReplay` keys by `(day, agent, model, source)`, and nothing else assumes a digest
maps to one coordinate. Re-fuzzed at 600 trials to confirm.

### A surface the first pass never tested: log files are untrusted input

Adapters parse JSONL written by other people's software, truncated by crashes and occasionally
corrupt. Nothing downstream validated what they produced, because everything downstream assumed
adapters produce numbers. Fed a deliberately corrupt transcript:

- a **string** where a count belonged turned `stats.tokens` into the concatenation
  `"110-99999lots00Infinity5311"` — and printed it as the card's headline;
- `1e308` made `ledgerSummary` return `Infinity`;
- **negative** counts passed straight through;
- and a six-digit year rendered as the day key `275760-09-13`, which the ledger accepts and the
  export format rejects — so **one** corrupt timestamp anywhere in a corpus silently disabled
  the whole of Stage 5. The feature worked, the data was fine, and the user could never export.

Worse, max-wins banks whatever it is given, so any of these would have been cemented in the
ledger permanently.

Gemini had a guard. The other three adapters did not. There is now one shared pair of boundary
coercions in `types.ts` — `count()` and `when()` — used by all four: non-finite, negative,
fractional and beyond-safe-integer counts read as zero, and a date outside a four-digit year
reads as absent. Zero rather than throwing, because one bad line must not cost a user every
other line in the file.

`when()` is bounded at four digits rather than at "now" on purpose: rejecting future dates would
mean a machine with a wrong clock loses real work, which is a worse failure than keeping a date
that is merely implausible. The job is only to guarantee every day key this tool writes is one
it can read back.

**One deliberate behaviour change.** Flooring makes a fractional Gemini record disagree with its
own stated total, so it is now skipped rather than banked — which is this adapter's documented
rule for a record that fails reconciliation, and avoids producing a non-integer bucket no export
could carry. Verified against the real corpus: **52,564 events, zero fractional, zero negative,
zero out-of-range counts, zero implausible dates** — so no real figure moves.

### Also checked, and sound

- **SVG injection** through model names and handles: ten payloads — closing tags, attribute
  breaks, `<foreignObject>`, CDATA escapes, entity refs — against the recap card, which is the
  surface that actually renders model names. All escaped, `<text>` tags balanced, no executable
  content. All attributes are double-quoted, so the unescaped `'` is inert. (An earlier version
  of this test ran against the usage card, which does not render model names at all, and
  therefore proved nothing — worth saying, because a vacuous test is worse than none.)
- **MCP server** under hostile JSON-RPC: unknown methods, unknown tools, missing params, wrong
  argument types, malformed JSON — all answered with correct error codes, none crashing or
  hanging. `days: -5` clamps to 1, `1e9` to 3650, `null` to the default 30, `7.9` truncates to
  7; an out-of-range year falls back to the current one. Writes nothing.
- **Real-data integrity after every fix**: `sync`, `recap` and `doctor` agree exactly, and the
  real ledger still round-trips through export and import as a no-op.

## QA round three — two more, both in how the tool behaves as a Unix citizen

### `tokenchit ledger | head` printed a crash dump

`head` closes the pipe the moment it has its lines. Every later write then failed with EPIPE,
which Node raises as an *unhandled* `error` event — so a standard shell idiom ended in a stack
trace and a non-zero exit, and `| less` did the same to anyone who quit before the end.

It only bit commands that do asynchronous work *between* writes: a `--json` command scans first
and writes once, so its single write lands in the pipe buffer before the reader is gone. That is
why it looked intermittent, and why the first attempt to reproduce it came back clean — piping
`2>&1` merges stderr into the very pipe being closed, hiding the evidence.

`ledger`, `doctor`, `init`, `recap` and `sync` were all affected. Fixed once at the entry point:
EPIPE on stdout or stderr exits 0, because the reader asking for less output than there was is
not a failure. Every other error still propagates.

### `--export` leaked a raw errno

`ledger --export /nope/deeper/x.json` reported `ENOENT: no such file or directory, mkdir
'/nope'` — a path the user never typed (the recursive mkdir's first failure point), with no
mention of the flag and no next step. `sync --out` had already fixed exactly this and carries a
comment saying so; the export path was written later and did not inherit it. Now wrapped the
same way.

### Also checked this round

- **Interrupted mid-write** (SIGINT during a scan): no stale lock left behind, and the next run
  proceeds normally.
- **Non-TTY output**: no ANSI escapes leak into a redirected file.
- **Unwritable `--out`**: already wrapped, still correct.

## QA round four — the three gaps the earlier rounds had admitted to

Round three closed with three things explicitly untested: another operating system, behaviour at
scale, and the site. All three were testable after all.

### Linux: green, including the optional native module on musl

Full `npm ci`, build and test run inside `node:22-alpine` (musl libc, arm64). Install, build and
all four suites pass, and `@resvg/resvg-js` — the optional native dependency behind PNG export —
loads. Two tests skip, both correctly and for opposite reasons: `on Linux, refuses a session with
no display` skips on macOS and runs there, and `one unreadable transcript does not abort the
scan` skips in the container because it runs as root and root can read a `chmod 000` file.

Windows remains genuinely untested — no VM available here. A static pass found explicit Windows
branches already in `desktop.ts` (`cmd /c start`) and `schedule.ts` (`schtasks` syntax), no
hardcoded POSIX separators in path construction, and no `getuid`/`umask` use. The git hook is a
`#!/bin/sh` script, which Git for Windows runs. That is a code reading, not a test result, and
should not be reported as one.

### Scale: comfortable

A synthetic five-year heavy corpus — 1,825 days x 4 agents x 3 models x 10 sessions =
**219,000 sessions across 21,900 cells**, a 7.9 MB ledger:

| Operation | Time |
| --- | --- |
| `ledgerSummary` | 15 ms |
| `buildExport` | 12 ms |
| serialise to JSON | 27 ms |
| parse from JSON | 105 ms |
| `validateExport` | 36 ms |
| `mergeExport` (self-merge, worst case) | 603 ms |
| `writeLedger` | 31 ms |
| `readLedger` | 214 ms |
| `mergeExport` into an empty ledger | 232 ms |

Heap 204 MB. `readLedger` runs on every command, so 214 ms is the figure that matters most, and
it is for a corpus far beyond a realistic user. The 64 MiB import cap is about 8x this file —
roughly forty years of the same intensity.

### The site: a real gap, and it was in the copy

Brought up Postgres and the Next dev server, ran the migrations, and published a payload
containing Gemini usage through the actual `/api/submissions` endpoint — so the test covered
`validate.ts`, the database and the board rendering together. The row landed (201), the board and
profile render `gemini` with its computed colour `#174EA6`, and the OG image route renders.

The first attempt was rejected into review for claiming 30 active days against 3 days of data,
which is the validator doing its job.

**What it found: the product copy never learned about Gemini.** Stage 2 made Gemini a real
adapter and updated the adapter registry, the icon table and the board filter — but six
user-facing places still read "Claude Code, Codex and OpenCode":

- the site hero, the page description shared by both preview cards, the OG image, and the invite
  text on a profile page;
- `tokenchit init --help`;
- the MCP server's README.

A user reading any of those would not know Gemini was supported. All six now name it. The OG
image was re-rendered to confirm the longer string still wraps cleanly rather than overflowing.

Comments and docs that name the older three for a *historical* reason — a note about a specific
rebuild bug, an incident in `claude-context.ts`, the stats-cache note in `internals.md` — were
left alone. They are accurate as written and are not a list of supported agents.

## QA round five — the copy gap was a symptom; here is the disease

Round four found six sentences that still named three agents. Fixing the sentences was not
fixing the problem: **nothing tied any prose to the adapter registry**, so adding an adapter
meant remembering to update a list nobody had written down. Looking around it found nine more
places, two of which were not omissions but false statements.

### Both READMEs said Gemini could not be counted

`README.md` and `packages/cli/README.md` each carried a supported-agents table without Gemini,
followed by a sentence asserting that **"Copilot CLI and Gemini CLI are detected but cannot be
counted... Gemini's chat transcripts carry no token counts at all."** That is the opposite of
the truth, it is near the top of the first file anyone opens, and it survived the whole of
Stage 2. Both now list Gemini with its real source path and reserve the unsupported paragraph
for Copilot alone.

### The site advertised and disclaimed the same agent

`apps/site/lib/agents.ts` had Gemini in `UNSUPPORTED` — "writes transcripts that carry no token
counts at all" — while the board filtered by it and the icon table coloured it. Gemini now has a
full agent page of its own, with the measured caveat that matters (token recording is recent
upstream; 2 of 2,141 session files on a real machine carried any token field), and the
unsupported list names only Copilot. Verified by rendering `/tool/gemini`.

### The privacy test proving "every adapter" covered three of four

`payload.noContent.everyAdapter` exists precisely so the no-content guarantee is not proved for
one adapter and assumed for the rest. It listed its adapters by hand, so when Gemini shipped the
test went on passing while silently covering three of four — and Gemini is the adapter with the
most sensitive material adjacent to the counts: a `content` field holding the prompt and reply
verbatim, and a `projectHash` identifying the working directory, which is outside the contract
hashed or not.

There is now a Gemini fixture carrying all three as canaries, and the coverage assertion is
**derived from the registry**: every adapter this build ships must contribute non-zero tokens,
so a new adapter with no fixture fails rather than quietly narrowing what the test proves.

Both halves were mutation-tested. Removing the fixture fails the test; making the adapter copy
the reply text into an event fails it with `CANARY_GEMINI_REPLY_a7f3 leaked into the payload`.
(A first attempt at the second mutation silently did not apply — worth recording, because a
mutation that no-ops looks exactly like a guarantee that holds.)

### Smaller, and real

- **`.tokenchit.json`** — this repo's own config omitted `gemini`, so its own published card
  excluded its own Gemini usage. `doctor` had been saying so all along: *"present but not in
  .tokenchit.json — its usage is excluded"*. Now included; the card counts its 1.61M.
- **npm keywords** in both published packages omitted `gemini`, so an npm search for it found
  nothing.
- **`banner.html`** and the site's sample recap data still described three agents.

### The durable fix

`apps/site/test/agents.test.js` ties the prose to the registry:

| Check | Catches |
| --- | --- |
| a page per supported adapter, and no others | an adapter added or removed without the site following |
| each page's `source` equals its adapter's | a documented path drifting from the real one |
| `UNSUPPORTED` equals core's probes | an agent moving between states one-sidedly |
| nothing is both supported and unsupported | exactly the Gemini contradiction |
| the board filters every adapter | a missing filter |
| both READMEs contain every adapter's source path | the README gap, by path so a passing mention cannot satisfy it |
| no user-facing prose matches the stale three-agent sentence | the six copy lines from round four |

Checking by **source path** rather than by name is deliberate: a path is verbatim from the
adapter, so the assertion cannot be satisfied by the name appearing incidentally elsewhere in
the file.

Prose cannot be generated from the registry — each agent page is a real piece of writing. But it
can be checked against it, and that is the difference between a list that drifts and one that
cannot.

**It found a second bug on its first run:** `packages/cli/README.md` documented Claude Code's
source as `~/.claude/projects/**/*.jsonl`, but the adapter reads `~/.claude*/` — every profile
directory, not just the default. A reader with a non-default Claude profile would have concluded
their logs were not covered.

Both guards were mutation-tested by deleting the Gemini page and by reverting the README row;
each failed the intended assertion and passed again on restore.

## Merge readiness

CI is green on Node 22 and 24, the site job passes, and the branch merges cleanly. Versions stay
at 0.8.0 deliberately: this repo bumps them in separate `Release vX.Y.Z` commits, not in feature
branches, and there is no CHANGELOG to update.

One thing was genuinely missing, and it is the only part of this work that changes something on
an existing user's disk.

### The migration warning existed only where no user would see it

Merging this means every user's ledger migrates to the v2 format on their next `sync`. Upgrading
is lossless. **Going back a version is not**, and nothing in the new code can change what an old
build does: a v1 build reads a v2 ledger as unrecognised, falls back to an empty bank, and
rewrites it from whatever logs are still on disk — destroying the one piece of state here that
cannot be re-derived.

That warning lived in `docs/implementation-notes.md` and nowhere else. Not in either README, not
in the CLI, not anywhere a person upgrading would meet it.

Now:

- `adopt()` sets a **transient** `migratedFrom: 1` when it carries a v1 ledger over. `writeLedger`
  strips it, so it is a signal to one run rather than a key in everybody's file.
- `sync` and `ledger` both say it, and name `--export` as the way to keep a copy no version of
  this tool will overwrite.
- The lifecycle is right by construction: a read-only `ledger` does not write, so the file stays
  v1 and the warning repeats — correct, because the hazard persists. The first `sync` migrates
  the file and the notice stops. Verified end to end, and covered by two tests.
- Both READMEs now carry it, alongside a short description of what `--export`/`--import` do and
  the by-session merge rule.

A test asserted on stdout and failed while the feature worked: `warn` writes to **stderr**, which
is what keeps `--json` pipeable. Recorded because the failure looked like a missing feature and
was a wrong assertion — the opposite mistake to the vacuous SVG test earlier, and the same
lesson: check what the test is actually reading before believing it.
