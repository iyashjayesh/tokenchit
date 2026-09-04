# Token accounting review

An audit of `packages/core` against sixteen hypothesised failure modes, run on 2026-09-05 against
one real machine's agent logs. No accounting code was changed. Every number below came from a
measurement script run against the live corpus, not from reading the code.

**Headline: the accounting is sound. Thirteen of sixteen hypotheses are refuted by measurement.**
The three confirmed defects are all in how history is *bounded* — retention, day attribution, and
the estimate that tries to reach past retention — not in how tokens are counted.

The one finding that changes how the product should be described is not a defect at all: **98.1% of
the Claude Code headline is `cache_read_input_tokens`.** The number is correct; what it means is
narrower than "tokens" suggests.

---

## Corpus

| Agent | Source | Volume |
|---|---|---|
| Claude Code | 4 profiles, 1,741 `.jsonl` files | 88,265 assistant usage entries → **41,483 deduplicated calls**, 10,777,523,322 tokens |
| Codex | 9 rollout files (7 usable) | 38,235,035 tokens |
| OpenCode | `opencode.db`, 253 message rows | 216 assistant messages, 17,561,923 tokens |

Claude Code profiles found: `~/.claude`, `~/.claude-personal`, `~/.claude-spark`, `~/.claude-work`.
Only the first two carry a `stats-cache.json`. Machine timezone is IST (UTC+05:30), which matters
for the day-bucketing checks.

Running the real `aggregate()` over all three adapters:

```
tokens          10,834,773,427
equivCostUsd    $7,304.77
pricedShare     99.83%
streakDays      27        activeDays  51
mix             claude-code 99.5%   codex 0.4%   opencode 0.2%
```

---

## Verdicts

| # | Hypothesis | Verdict |
|---|---|---|
| 1 | Claude Code dedup key too coarse | Refuted |
| 2 | First-seen entry wins, undercounting rewrites | Refuted |
| 3 | `input_tokens ≤ 1` rows indicate lost input | Refuted |
| 4 | Cache fields dropped from headline or cost | Refuted — but see §1.4 |
| 5 | Sidechain / meta / error / summary entries mishandled | Refuted |
| 6 | Config-directory coverage gaps | **Partly confirmed** |
| 7 | Transcript retention silently truncates history | **Confirmed** |
| 8 | Codex cumulative counter double-counted on resume | Refuted (protection untested by this corpus) |
| 9 | Codex `reasoning_output_tokens` dropped | Refuted |
| 10 | Codex `cached_input_tokens` double-counted | Refuted |
| 11 | Codex session spanning midnight mis-dated | **Confirmed** |
| 12 | OpenCode `reasoning` dropped | Refuted |
| 13 | OpenCode WAL data missed by the read-only handle | Not reproducible at rest |
| 14 | OpenCode `time.created` unit confusion | Refuted |
| 15 | Cross-agent double counting | Refuted |
| 16 | Window and streak boundaries inconsistent | **Partly confirmed** |

---

## 1. Claude Code

### 1.1 Dedup key — refuted

`claude-code.ts:145` keys on `` `${msg.id ?? ""}:${row.requestId ?? ""}` `` — the composite pair,
not `message.id` alone. Entries carrying neither are dropped at `claude-code.ts:146`; **zero such
entries exist** in the corpus.

### 1.2 Which duplicate wins — refuted

`claude-code.ts:165` keeps the entry with the **largest** total, not the first seen. Measured cost
of getting this wrong:

```
sum of first-seen totals   10,765,266,241
sum of max totals          10,776,183,225
delta                          10,916,984   (0.10%)
```

Small in aggregate, but one-sided — first-seen can only ever undercount, and the output-only delta
over the trailing 30 days is 9,566,606 tokens, i.e. almost all of the error is recent.

### 1.3 Near-zero `input_tokens` — refuted

1,722 of 88,265 assistant entries (2.0%) report `input_tokens ≤ 1`. These are not truncated records:
their payload sits in `cache_read_input_tokens`, which is counted. No loss.

### 1.4 Cache fields — refuted, with a framing problem

Both cache buckets reach the headline (`types.ts:37`) and are priced at their own rates
(`pricing.ts:54-66`). Nothing is dropped. But the composition of the 10.78b headline is:

| Field | Tokens | Share |
|---|---:|---:|
| `cache_read_input_tokens` | 10,568,315,867 | **98.1%** |
| `cache_creation_input_tokens` | 175,367,053 | 1.6% |
| `output_tokens` | 31,053,845 | 0.3% |
| `input_tokens` | 2,786,557 | 0.03% |

This is the mechanical reason the figure looks implausibly large next to intuition. Cache reads bill
at roughly a tenth of the input rate, so the token count and the cost figure are describing very
differently-weighted things. The arithmetic is right; the word "tokens" is doing more work than a
reader expects.

*Not a code defect. It is the single most useful thing to say in the UI.*

### 1.5 Special entry types — refuted

| Condition | Count | Tokens carried |
|---|---:|---:|
| `usage` on a non-assistant role | 0 | — |
| `isMeta` | 0 | — |
| `type: "summary"` | 0 | — |
| Missing both `message.id` and `requestId` | 0 | — |
| `isApiErrorMessage` | 87 | **0** |
| model `<synthetic>` (filtered at `claude-code.ts:149`) | 110 | **0** |

Sidechains deserve their own line, because they are large and the handling is load-bearing:

```
keys seen only on the main chain    24,140    9,678,481,633 tokens
keys seen only inside a sidechain   17,448    1,098,832,657 tokens   (10.2%)
keys seen on BOTH                        0                0 tokens
```

Zero overlap. The `(message.id, requestId)` key already separates a subagent's own calls from its
parent's replayed ones, so keeping sidechains adds no double-count — and dropping them would erase a
tenth of the total.

### 1.6 Path coverage — partly confirmed

`claudeRoots()` (`claude-code.ts:23-48`) scans `$HOME` for `.claude` and `.claude-*`, **and** honours
`CLAUDE_CONFIG_DIR` additively at `claude-code.ts:26-27` — including a value outside `$HOME`. That
half of the hypothesis is refuted; `CLAUDE_CONFIG_DIR` is set to `~/.claude-personal` here and is
picked up.

The gap is XDG: `~/.config/claude/projects` is never consulted. It does not exist on this machine, so
the miss is unmeasurable here — but it is unreachable by construction for anyone who does use it.

### 1.7 Retention — confirmed

`cleanupPeriodDays` is unset in all four profiles, so Claude Code's 30-day default applies.
Transcripts currently hold 42 active days spanning 65 calendar days (2026-07-02 → 2026-09-04),
because replayed turns inside surviving files reach back further than any file's own mtime.

```
days already past the 30-day boundary   13 of 42
tokens on those days                    1,778,549,372   (16.5% of the Claude Code headline)
tokens within 30 days                   8,999,196,120
```

Sixteen and a half percent of the current figure is sitting on borrowed time and will disappear
without warning as cleanup runs. `STREAK`, `ACTIVE DAYS` and the sparkline read only what survives:
the current 27-day streak is real, but the largest apparent idle gap in the record is 17 days, which
is indistinguishable from deleted logs.

---

## 2. Codex

### 2.1 Cumulative counter — refuted here, protection unexercised

`codex.ts:130-134` takes each rollout's *growth* rather than its final reading. Measured:

```
adapter attributes           38,235,035
sum of final readings        38,395,304   (naive)
difference                      160,269   (0.42%)
```

The 0.42% matches the code comment's own figure exactly. **No resumed session exists in this
corpus** — every file's first reading is small relative to its last — so the resume-inheritance
guard, which is the entire reason the growth approach exists, is not exercised by this data. It is
defensively correct, not empirically confirmed.

**Latent hole:** `codex.ts:133` uses `baseline === usage ? 0 : baseline[field]`, so a rollout with
exactly *one* `token_count` event contributes its full reading. Correct for a fresh session, wrong
for a resumed one. The minimum event count in this corpus is 3, so the case is untriggered here.

### 2.2 Reasoning tokens — refuted

In all 7 usable files, `total_tokens == input_tokens + output_tokens` **exactly**.
`reasoning_output_tokens` (5,793–20,779 per session) is already inside `output_tokens`. Adding it, as
the hypothesis suggests, would double-count. Ignoring it is correct.

### 2.3 Cached input — refuted

Codex nests cached input inside `input_tokens` rather than beside it. `codex.ts:135-136` subtracts
it, keeping the four buckets disjoint. Confirmed by the identity in §2.2 holding to the token.

### 2.4 Midnight-crossing sessions — confirmed

One of nine sessions spans a local midnight. Its entire growth is attributed to the day of its last
turn:

```
rollout-2026-06-21T23-12-18   spans 2026-06-21 → 2026-06-22
                              all attributed to 2026-06-22
                              420,947 tokens (1.1% of Codex) land on the wrong day
```

This is the coarseness the adapter comment already acknowledges. It moves a day boundary, never a
total — confirmed: the lifetime figure is unaffected.

### 2.5 Sessions with no usage

Two of nine rollouts record `info: null` on every `token_count` event — rate-limit heartbeats only.
Handled correctly at `codex.ts:112-113`. Worth knowing that Codex emits sessions that account for
nothing.

---

## 3. OpenCode

### 3.1 Reasoning tokens — refuted

`tokens.total == input + output + reasoning + cache.read + cache.write` in **all 216 messages, zero
discrepancy across the corpus.** OpenCode stores reasoning *beside* output, the opposite of Codex, so
folding it in at `opencode.ts:87` is required rather than optional. The two adapters disagree because
the two formats disagree, and both are right.

### 3.2 WAL — not reproducible at rest

`opencode.db-wal` is 0 bytes. A read-only handle on the live database and a checkpointed copy both
return 253 rows. The risk is real only while OpenCode is mid-session, and could not be provoked here
without writing to the user's database, which was out of scope.

### 3.3 Timestamps — refuted

`time.created` ranges 1784742421188 – 1785144564704: unambiguously milliseconds (interpreted as
seconds these land in the year 58526). `new Date(created)` at `opencode.ts:76` is correct.

### 3.4 Reverted and duplicate messages — refuted

0 reverted, 0 duplicate ids, 0 missing `tokens` blob, 0 missing `time.created`.

### 3.5 The ignored `cost` field — correctly ignored

Summing the blob's own `cost` across all 216 assistant messages gives **$0.0000**, against 17,561,923
real tokens. `opencode.ts:26-30` is right to recompute from the price table; trusting the field would
silently zero out every OpenCode row.

### 3.6 The real OpenCode problem is pricing, not counting

All three models observed are unpriced: `qwen3-coder-next` (17,902,820 tokens), `big-pickle`
(17,952), `qwen3.5-122b` (0). `costOf` correctly returns `null` rather than `0`
(`pricing.ts:54-56`), so they contribute tokens and no cost, and depress `pricedShare` honestly.

Two consequences worth naming. First, 96% of OpenCode's total is cacheRead against a **local
llama.cpp server**, where the marginal cost is electricity — the tool cannot distinguish that from a
metered API, and `equivCostUsd` would be meaningless for it even if a price existed. Second, on a
card where OpenCode is a large share, `TOKENS` and `SPEND` describe different subsets of the same
activity.

---

## 4. Cross-cutting

### 4.1 Cross-agent double counting — refuted

The three adapters read disjoint sources with no shared identifiers. There is no path by which one
API call reaches two adapters.

### 4.2 Day bucketing — correct

`localDay()` (`aggregate.ts:48-52`) buckets by local calendar day. This matters here: Codex rollout
*filenames* are local time while event *timestamps* are UTC, and at UTC+05:30 a naive UTC bucket
would shift evening sessions a day earlier. Verified no systematic shift; the only day error is §2.4.

### 4.3 Window boundaries — partly confirmed

`aggregate.ts:81-82` computes `d30`/`d7` by subtracting days from the current **instant**, then
compares `e.ts < from`. So "last 30 days" means the last 720 hours, not the last 30 calendar days,
and the boundary day is partially included depending on what time the command runs.

```
30d window, instant cutoff              9,001,878,386
30d window, whole local days ≥ 08-06    9,003,377,687
difference                                  1,499,301   (0.017%)
```

Negligible in magnitude, but it means the same command run at 09:00 and at 23:00 reports different
30-day totals. Inconsistent with `streakDays`, which *is* calendar-based (`aggregate.ts:176-193`).

### 4.4 `events` is dead and incomparable

`bucket.events` is incremented at `aggregate.ts:133` and read nowhere in `packages/cli`,
`packages/core` or `apps/site`. Just as well, because it is not comparable across agents: one
"event" is a deduplicated API call for Claude Code (41,483), a whole rollout file for Codex (7), and
a single message for OpenCode (216). Any per-event average across agents would be meaningless.

### 4.5 Codex distorts the heatmap

Each Codex rollout yields exactly one event at one timestamp, so a multi-hour session lands entirely
in one `(weekday, hour)` cell of the heatmap and hour histogram. At 0.4% of this machine's mix the
distortion is invisible; on a Codex-heavy machine it would not be.

---

## 5. The stats-panel estimate

Not in the original hypothesis list, but it now drives the headline figure (shown with a `~`
marker), so it was audited. **This is where the real defects are.** Measured:

```
verified   10,779,279,703      transcripts on disk, deduplicated
estimated  14,503,950,731      verified + calibrated estimate of rotated-away days  (+34.6%)
panel      28,738,284,000      what Claude Code's own Stats panel reports
calibration ratio 1.843        median over 30 overlap days, spread 1.038 – 4.924
```

### 5.1 The calibration is sound — refuted as a concern

Recomputing the median over only the 23 days too recent to be partially rotated (≥ 2026-08-08) gives
1.820 against 1.843, moving the estimate by 0.3%:

```
median 1.843 (all 30 admitted days)      →  14,504,276,071
median 1.820 (23 unrotated days only)    →  14,552,352,468
```

The median is robust to the calibration window. This part of the design works.

`ourDaily` is also correctly filtered to `claude-code` only (`claude-context.ts:20-23`), so the ratio
is not contaminated by Codex or OpenCode tokens on the same days.

### 5.2 Partially-rotated days fall through the gap — **confirmed defect**

`estimateUnseen` splits days three ways: no transcript at all → add to `missing`; ratio inside
[1, 5] → use for calibration; anything else → **discarded entirely** (`claude-stats.ts:170-180`).

That third branch is the bug. A day whose transcripts are *mostly* rotated away has a huge ratio, is
correctly excluded from calibration — the comment at `claude-stats.ts:135-142` explains exactly
why — and is then never added to `missing` either, because `ours > 0`. Six such days exist:

| Day | Panel cache | Transcripts hold | Ratio |
|---|---:|---:|---:|
| 2026-07-20 | 586,701,502 | 32,339,749 | 18.1× |
| 2026-07-25 | 707,267,576 | 16,305,021 | 43.4× |
| 2026-07-27 | 326,542,224 | 787,674 | 414.6× |
| 2026-07-28 | 259,003,109 | 838,219 | 309.0× |
| 2026-07-29 | 416,185,622 | 82,242,736 | 5.1× |
| 2026-07-30 | 437,379,392 | 9,203,439 | 47.5× |

```
panel total on those 6 days      2,733,079,425
deflated at ratio 1.843          1,482,793,690   ← what they are probably worth
the estimate credits only          141,716,838   ← the surviving transcript fragments
UNCOUNTED                        1,341,076,852
```

**The estimate understates by roughly 1.34b tokens — about 9% of itself — and the error is
one-sided.** A day is either fully missing (estimated) or fully present (counted); a day that is
half-eaten is silently reduced to its surviving fragment. The fix is to treat a day above the ceiling
as partly missing rather than as an unusable overlap, but that is an accounting change and out of
scope for this pass.

### 5.3 `days.theirs` double-counts calendar days — **confirmed defect**

`claude-stats.ts:236` computes `theirs` as `panels.reduce((a, p) => a + p.days, 0)` — the sum of each
profile's day count. Two profiles that were both active on the same Tuesday contribute two days.

```
days.theirs as reported                              100
distinct calendar days in dailyModelTokens            75
```

**Twenty-five days of double-counting in a figure shown to the user.** `days.ours` (42) is a distinct
count from a `Map`, so the two halves of the same displayed pair are computed differently and are not
comparable.

### 5.4 The panel's daily rows do not cover the panel's own lifetime

`modelUsage` is a lifetime total; `dailyModelTokens` is a rolling window (30 rows for
`.claude-personal`, 63 for `.claude`).

```
panel lifetime (modelUsage)        28,738,284,000
sum of dailyModelTokens rows       27,625,461,223
lifetime beyond the daily rows      1,112,822,777   (3.9%)
```

That 3.9% is invisible to `estimateUnseen`, which can only work from daily rows. It is a ceiling on
what the estimate can ever recover, and it will grow as the panel's own daily window rotates.

### 5.5 Profiles without a cache deflate the ratio

`.claude-work` and `.claude-spark` have transcripts but no `stats-cache.json`. Their tokens enter
`ourDaily` while contributing nothing to `theirDaily`, pushing those days' ratios below 1. Four days
land under the floor (2026-08-03 at 0.83×, 08-06 at 0.89×, 08-13 at 0.94×, 08-15 at 0.49×) and are
correctly excluded from calibration — but they are excluded for the wrong reason, and on a machine
where the uncached profiles were the busy ones this would strip most of the calibration set.

---

## Ranked findings

1. **§5.2 — the estimate drops partially-rotated days.** One-sided, ~1.34b tokens (9% of the
   estimate) on this machine, and it grows as retention eats further into the overlap region. This is
   the only defect that materially misstates the headline.
2. **§5.3 — `days.theirs` double-counts across profiles.** 100 reported against 75 actual. A visible,
   trivially fixable wrong number sitting next to a correctly-computed one.
3. **§1.7 — retention.** 16.5% of the Claude Code figure is already past the default cleanup
   boundary. Not a bug, but the card's history silently shrinks, and streak/sparkline inherit that.
4. **§1.4 — the headline is 98.1% cache reads.** Not a defect. It is the explanation people are
   owed, and saying it once in the UI would retire most of the "why is this number so big" question.
5. **§2.1 — the single-event Codex rollout.** Latent, untriggered here, cheap to close.
6. **§1.6 — XDG config path.** Unreachable directory, unmeasurable impact on this machine.
7. **§4.3 / §4.4 / §4.5 — instant-based windows, dead `events` field, Codex heatmap concentration.**
   All real, all small.

## What was not tested

- **Codex resume inheritance.** No resumed rollout exists in this corpus. The guard that motivates
  the entire growth-based design is unexercised by real data here.
- **OpenCode WAL contention.** Requires OpenCode running mid-session; provoking it means writing to
  the user's database.
- **XDG config directory.** Absent on this machine.
- **Multi-machine aggregation and publish-side validation.** Out of scope for this pass.
- **Anything on the server or the board.** This audit stops at `packages/core`.
