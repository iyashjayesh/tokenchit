# tokencard — research, positioning and infrastructure

**All figures verified 2026-09-02.** Free-tier terms moved a lot through 2025–26 — Xata and
PlanetScale both removed their free tiers, Turso cut its limits, Upstash changed its metering
axis. **Re-check every number here before acting on it.**

Method: three deep-research passes, 320 subagents, ~10.8M tokens. Each claim was extracted from
a primary source and put through 3-vote adversarial verification (2 of 3 refutes kills it).
Votes are quoted throughout as `3-0`, `2-1` etc. Claims that failed are recorded in
[§9 Refuted](#9-refuted--do-not-repeat-these) rather than dropped, because several of them are
things a reasonable person would otherwise assume.

---

## TL;DR — the decisions

| Question | Answer | Confidence |
| --- | --- | --- |
| Is the idea taken? | **Yes, largely.** viberank ships the CLI, the leaderboard *and* README SVG badges | high |
| What's still unoccupied? | Year-in-review recap, local-commit refresh, honest tier table, design | high |
| Card delivery | **CLI renders + commits the SVG into the user's repo.** No hosted endpoint at v1 | recommendation |
| Site hosting | Vercel Hobby or Cloudflare Pages — both fine for a static site | high |
| Database | **Neon Free.** Runner-up Turso | high |
| Anti-abuse | Plausibility bounds + OAuth provenance tiers + manual flagging. **Not cryptography** | high |
| Funding programs | **Unknown** — failed verification twice | — |
| Camo caching | **Unknown** — failed verification twice. Measure empirically | — |

---

## 1. Competitive landscape

### viberank — the direct competitor

[github.com/sculptdotfun/viberank](https://github.com/sculptdotfun/viberank) · MIT ·
115 stars / 18 forks · created 2025-07-03 · **last pushed 2026-08-28** (alive)

It is the same product:

- ccusage-based, covering Claude Code / Codex / Gemini CLI / Copilot / OpenCode
- `npx viberank-cli` runs `ccusage daily --json` locally and POSTs aggregates only
- "Your code and prompts never leave your machine"
- **`GET /api/badge/{username}`** returns a shields-style SVG with a `metric` param
  (`rank|cost|tokens`) explicitly for README embeds, plus a shareable rank card for OAuth users
- Four ingestion paths: npx CLI, curl, signed-in web upload, and a **`viberank-mcp` MCP server**,
  plus autosubmit
- Per-tool SEO landing pages (`/tool/claude`, `/tool/codex`), a blog, SSR for crawlability
- Stack: Next.js 16 / React 19 on Vercel + Supabase + NextAuth GitHub OAuth

> **The assumed "card-first differentiation gap" does not exist** (verified 3-0). An earlier claim
> that viberank exposes no README badge was **refuted 0-3** — a verifier found the endpoint
> documented in the README.

**Scale is soft in both directions.** 115 GitHub stars vs a site claiming 800+ developers /
$2.1M tracked spend / 2.3T tokens. A larger figure set (1.2K devs, $12.0M, 13.5T tokens) failed
verification 1-2. Do not plan against any of these numbers.

### claudeusage.com — not competition, but a template

Claude-only. The CLI repo ([bazarkua/claudeusage-sync](https://github.com/bazarkua/claudeusage-sync),
MIT, ~2 stars) has no traction. But its trust section is the best-executed version of what
tokencard's section 04 is reaching for — an explicit two-column manifest, verified against raw
HTML:

| Uploaded | Withheld |
| --- | --- |
| API-equivalent cost in USD | Prompts and responses |
| Active hours and session counts | Your code and file contents |
| Input/output/cache token totals | Raw Claude Code JSONL files |
| Per-model usage mix | File paths and project names |
| Day-level activity for a contribution grid | Individual message and request IDs |

Closing line: *"Open source and auditable. You can read every line the CLI sends before it sends it."*

Caveat: "auditable" is vendor self-description; the CLI was not audited. This is a template for
**framing**, not evidence of traction.

### github-readme-stats — the cautionary tale

The canonical project in this genre **officially documents its own public instance as unreliable**,
and it was returning `HTTP 503 DEPLOYMENT_PAUSED` on live test 2026-09-02 across three paths.

Verified verbatim from `master/readme.md` (49,853 bytes, fetched 2026-09-02):

> line 111: *"The public Vercel instance at https://github-readme-stats.vercel.app/api is
> best-effort and can be unreliable due to rate limits and traffic spikes"*
>
> line 852: *"Because the public endpoint is not reliable, we recommend self-deployment via
> GitHub Actions or your own hosted instance."*

Recurring issues #4737 (Jan 2026), #4780 (Feb 2026), #4867 (Apr 2026) confirm the pattern.
Issue #4748 is a discussion titled *"Deprecate Vercel hosting due to rate limiting"*.
Issue #1471 gives the mechanism: **7 rotated PATs (~35k GraphQL points/hr) exhausted despite a
~73% Vercel cache hit rate.**

**Their root cause does not transfer to us** (verified, unanimous). They die on GitHub's
5,000-req/hr API limit because every render calls the GitHub API. tokencard renders from its own
stored ccusage data with **no third-party call per request**. Hosting-spend risk and
upstream-quota risk are different problems; only the first applies to us.

---

## 2. Architecture recommendation — ship no card endpoint at v1

**Let the tokencard CLI render the SVG locally and commit it into the user's own repo.**

This is the pattern github-readme-stats retreated to. Verified properties:

- A scheduled Action commits `profile/*.svg` into the user's `USERNAME/USERNAME` repo and
  embeds it as `![Stats](./profile/stats.svg)` — a repo-relative path
- **It bypasses camo entirely.** Verified first-hand against live github.com HTML for
  `anmol098/waka-readme-stats`: external images (shields.io, imgur, starchart.cc) are rewritten
  to `camo.githubusercontent.com`, while the Action's own committed chart is served as a bare
  `raw.githubusercontent.com` src with **no camo wrapper**
- Refresh compute is charged to the user's own free public-repo Actions quota

**For tokencard this only works as a local-CLI-commits flow, not a runner-fetches flow** — an
Actions runner cannot see local ccusage logs.

That constraint is the opportunity. Three problems collapse into one solution:

| Problem | How the local-commit flow solves it |
| --- | --- |
| Hosting cost and abuse surface | There is no endpoint |
| Camo behaviour is unknown, so capacity is unplannable | Camo is not involved |
| viberank already occupies the hosted-badge niche | **They structurally cannot copy this** — only a local CLI can read local logs |

The site then becomes static, and a hosted endpoint becomes an opt-in convenience added later,
once real load can be measured.

**Open design question:** does the CLI push a rendered SVG directly, or push a stats JSON that a
scheduled Action renders? And how does the flow survive GitHub's 60-day auto-disable of scheduled
workflows when `git commit || exit 0` produces no commit on an unchanged card?

---

## 3. Hosting

| Provider | Free limits | Overage behaviour | Commercial use on free plan |
| --- | --- | --- | --- |
| **Cloudflare Workers** | 100k req/day, 10 ms CPU/invocation, resets 00:00 UTC | **Hard-fails with an error** — no surprise bill | **No restriction** (3-0) |
| **Vercel Hobby** | — | — | Non-commercial personal only — **but donations are explicitly allowed** |
| **Netlify Free** | — | **Site suspended for rest of calendar month** — no surprise bill | **Explicitly permits commercial** (2-0) |
| **GitHub Pages** | 100 GB/month *soft* bandwidth per site | Soft | — |
| **Render Free** | 750 instance-hrs/workspace/month | Suspended when exhausted | — |

**Render is disqualified** for anything latency-sensitive: spins down after **15 minutes** idle
with a **~1 minute cold start**. Its free Postgres is worse — **expires 30 days after creation**,
14-day grace, then deleted. That is a trial, not a database.

For an unfunded project running a public endpoint, **hard-fail beats overage billing**. Cloudflare
and Netlify both break rather than bill. That should outrank raw limits in the decision.

### The Vercel Hobby clause, stated correctly

Both the first research pass and I initially got this backwards. The correct position:

> **Hobby teams are restricted to non-commercial personal use only.** All commercial usage of the
> platform requires either a Pro or Enterprise plan. *(verbatim, 3-0)*

> **Asking for Donations `does not` fall under commercial usage.** *(verbatim from raw HTML, 3-0)*

**Why this was misread:** Vercel's docs-to-markdown rendering **strips the bold `does not`**,
making the sentence read as its own opposite. Only fetching the raw HTML of
`vercel.com/docs/limits/fair-use-guidelines` reveals the negation.

The five disqualifying behaviours are: payment processing, advertising a product for sale, being
paid to build/host the site, affiliate linking as primary purpose, and ad units (e.g. AdSense).
**An OSS marketing site with a GitHub Sponsors link hits none of them.** Vercel Hobby is viable.

### The Cloudflare wrinkle

Cloudflare is the intuitive pick for a cacheable SVG endpoint, but two findings complicate it:

- Cloudflare reserves the right to limit CDN access for serving *"a disproportionate percentage of
  pictures, audio files, or other large files"* without a qualifying Paid Service **(2-1)**.
  SVG badges are pictures.
- The reassuring counter — that Cloudflare names the Developer Platform as satisfying the
  large-file requirement, making a Worker-generated SVG the *sanctioned* path — was
  **refuted 0-3**.
- *"Workers charges nothing for egress"* was also **refuted 0-3**. Do not assume free bandwidth.

Terms relocation to note: the old §2.8 "Limitation on Serving Non-HTML Content" no longer exists
in the Self-Serve Subscription Agreement (§2 now ends at 2.7); the restriction moved to the
Service-Specific Terms (Application Services). Self-serve agreement updated 2025-09-12,
service-specific terms 2026-06-02.

**If you do ship a hosted badge endpoint on Cloudflare, ask them directly first** — badges would
be the entire product.

---

## 4. Databases

| Provider | Status | Free limits | Idle behaviour |
| --- | --- | --- | --- |
| **Neon** ✅ | Alive | 100 CU-hrs/project/mo, 0.5 GB/project, 100 projects, 10 branches/project, 5 GB egress, autoscale cap 2 CU | Scale-to-zero at 5 min, **auto-resumes**; not disableable on Free |
| **Turso** | Alive, **cut** | 100 DBs, 5 GB, 500M rows read/mo, 10M written/mo, 3 GB syncs, 1-day PITR | No pause documented — **but limits docs 404** |
| **Supabase** | Alive | 500 MB DB, 5 GB egress + 5 GB cached, 1 GB files, 50k MAU, **2 active projects** | Pauses after 7 days *low* activity; **manual Studio restore** |
| **MongoDB Atlas** | Alive | "Free cluster" (renamed from M0), 512 MB, non-configurable | Pauses after **30 days zero connections**; old-version clusters may fail to restore |
| **Upstash Redis** | Alive, **reshaped** | 256 MB, 10 GB bandwidth/mo, **500K commands/month**, 10 free DBs/account | No pause documented for claimed DBs |
| **CockroachDB** | Alive, restricted | Basic (renamed from Serverless): 50M RU + 10 GiB/mo = a $15 monthly credit | Scoped to pay-as-you-go orgs; no-card path is a $400 trial, **clusters deleted after 30-day grace** |
| **Xata** ❌ | **REMOVED** | — | Xata Lite permanently retired **28 Feb 2026** (`HTTP 410 Gone`) |
| **PlanetScale** ❌ | **REMOVED** | — | Hobby retired **8 Apr 2024**, announced 6 Mar 2024 |

### Recommendation: Neon

The deciding distinction is **transparent auto-resume vs operator-restored pause**. Neon's
5-minute scale-to-zero resumes itself on the next connection. Supabase's pause requires a human
clicking restore in Studio — for a public leaderboard that means it is down until someone notices.

Neon docs, verbatim: **"None of these limits delete your data."** Exhausting a limit suspends
compute until the next billing month. Deletion is only ever user-initiated (7-day recovery
window). The worst documented idle outcome is `tenant_detach` after 30 days idle — a **cold start,
not a delete**. 100 CU-hours ≈ 400 hours at 0.25 CU, far more than a low-volume leaderboard needs.

**Turso is the runner-up** — 500M monthly reads is generous and no inactivity pause is documented —
but it is second because its limits docs 404 (so absence of an archiving policy is *unconfirmed*),
the new Cloud engine is labelled "early preview", and the tier was **already cut once**
(500 DBs / 9 GB / 1B reads → 100 / 5 GB / 500M).

### Two corrections to widely-repeated folklore

Both verified 3-0:

1. **Supabase's restore window is 1 year, not 90 days.** The 90-day figure is stale — it survives
   only in the docs anchor slug `[#90-day-window-to-restore]` and an un-refreshed screenshot with
   alt text "Project Paused: 90 Days Remaining". The pausing doc was last changed 2026-07-24.
   It is also a *restore* window, not a deletion event: afterwards the backup file and Storage
   objects remain downloadable from the dashboard.
2. **Supabase pauses on *low* activity, not zero.** Docs say "a few user requests to the database
   each day" over the week suffices to stay active. A leaderboard with real traffic would not
   pause. Supabase is less disqualified than it first appears — it is the *manual restore*, not
   the pause trigger, that rules it out.

Also: the claim that Upstash allows only **1** free database was **refuted 0-3** — it is 10 per
account. Upstash's only documented deletion is for no-signup `/start-redis` databases, deleted
after 72 hours unless claimed.

---

## 5. Anti-abuse — cheaper than planned

Both competitors converged on the same recipe for self-reported client-side data, and it is
**explicitly not cryptographic proof of the payload** (verified 3-0):

**Arithmetic plausibility bounds**
- One-sided token-sum check — reject only when `total < input + output + cache_creation + cache_read`
  (reasoning tokens count toward totals but are not broken out)
- Cost/token ratio must fall in a published band (`0.000001`–`0.1`) — described as *"the primary
  guard against inflated token counts"*
- No negative values anywhere in totals or daily breakdowns
- Dates must be `YYYY-MM-DD`, rejected beyond tomorrow-UTC (covers all timezone offsets)
- Hard ceilings: **$5,000/day**, **250M tokens/day**, total cost capped at $5,000 × 365

**Provenance tiering**
- GitHub sign-in marks a submission verified with a blue check; unverified CLI rows show a `cli` badge
- API tokens minted while signed in also confer the check — OAuth is one of two verified paths
- **Unverified rows still appear on the board** — a transparency signal, not a gate

**Manual layer** — an admin flag endpoint gated by an allowlist; flagged rows hidden by default.

**Implication for tokencard:** ship self-reported plus the honest tier table. Hash-chained
device attestation is real cryptosystem work, and a patched client defeats it anyway (as the
design doc already concedes). The market has decided the cheap recipe is sufficient.

---

## 6. Feature ideas

**Grounded in what competitors actually shipped:**
- **MCP server as an ingestion path** — viberank has `viberank-mcp`; a genuinely modern surface
- **Per-tool SEO landing pages** (`/tool/claude-code`, `/tool/codex`, …) — free distribution
- **Two-column privacy manifest** — stronger than a test-output panel; consider shipping both
- **Autosubmit** — reduces the "remember to sync" drop-off

**Unoccupied, and worth leading with:**
- **Year in review** — nobody has it; it is already designed and built
- **Local-commit refresh** — see §2; the one thing a hosted competitor cannot replicate

**Turning vanity into signal** (unvalidated, but the strategic direction):
- **Cache-hit rate** — ccusage has the data, and it is the one metric where a *lower* bill wins.
  It inverts the incentive problem that makes a token leaderboard reward waste
- Tokens per merged PR, cost per commit
- Model mix over time — more interesting than agent mix
- Team/org cards

**On what the board ranks by.** Total tokens is the ranking that is simultaneously easiest to
fabricate and least meaningful — it puts whoever has the worst retry loop at #1. Alternatives, in
increasing order of preference:
1. **Rank by streak** — harder to fake under attestation (a hash chain literally proves daily continuity)
2. **Rank by cache-hit rate** — rewards efficiency
3. **Do not rank at all** — publish the *mix distribution* across all opted-in users. "What N
   developers actually run" is a citable, linkable artifact; a top-8 list is not. It also makes
   the spend-disclosure problem mostly evaporate

**Spend disclosure is the biggest adoption barrier.** Publishing `$2,740/yr` discloses personal or
employer financial information; many people simply cannot. The `hide` param already supports this
— make spend **hidden by default** on the public board. That is a default change, not a feature.

---

## 7. Sustainability — largely unresolved

Only indirect signals survived verification:

- github-readme-stats **is Vercel-sponsored** (per its Discussion #703)
- Vercel runs an **application-based OSS sponsorship path** — an exception you apply for, not an
  automatic carve-out

Everything else about Cloudflare Project Alexandria, Vercel OSS, Netlify Open Source, Fly.io OSS
credits, Supabase OSS and Sentry for Open Source **failed verification across two passes**. The
pages were fetched; no claim survived. Treat this section as unresearched and check each program
directly.

---

## 8. Open questions

1. **How does camo actually cache?** Does it honour origin `Cache-Control: max-age`? How long? Does
   it revalidate? What are the size/timeout limits? **This is the single fact that determines
   whether a hosted endpoint ever approaches 100k req/day** — and it failed verification twice.
   *Resolve empirically: publish a test badge, watch origin logs.*
2. **What are the OSS sponsorship programs actually worth?** (§7)
3. **Given viberank ships the badge too, what is the one-sentence differentiation?** Recap?
   Local-commit? Design? Honest tiers? Pick one and lead with it.
4. **Local-commit mechanics** — CLI pushes rendered SVG, or JSON that an Action renders? How to
   survive the 60-day scheduled-workflow auto-disable when nothing changes?
5. Free-tier limits and cold starts for **Deno Deploy, Fly.io, Railway** — never verified.

---

## 9. Refuted — do not repeat these

Fourteen claims were killed in pass 1 and six in pass 2. The ones worth recording, because they
are things a reasonable person would assume:

| Refuted claim | Vote |
| --- | --- |
| viberank exposes no README badge, leaving the embed niche open | 0-3 |
| Soliciting donations counts as commercial usage on Vercel Hobby | 0-3 |
| Cloudflare Workers charges nothing for egress/bandwidth | 0-3 |
| Cloudflare names the Developer Platform as satisfying the large-file requirement | 0-3 |
| Upstash Redis free tier is capped at 1 database | 0-3 |
| GitHub Pages terms restrict commercial use | 0-3 |
| Render's docs state no restriction on commercial use | 0-3 |
| github-readme-stats' per-card cache lifetimes and the 21600–86400s `cache_seconds` clamp | 0-3 |
| viberank's badge endpoint uses stale-while-revalidate with no rate limiting | 0-3 |
| Camo prevents the card server from inferring per-viewer theme | 0-3 |
| claudeusage's strongest pitch is 30-day log retention | 0-3 |
| viberank self-reports 1.2K devs / $12.0M / 13.5T tokens | 1-2 |
| The root scaling constraint is GitHub's 5,000 req/hr limit *(true for them, not for us)* | 1-2 |

**Every concrete cache-header number from prior art was killed.** If you design caching from
published write-ups, read the source code instead.

**A security misstatement caught in passing:** GitHub's classic `repo` scope is **full read/write**
on private repos, not read-only. Do not copy that phrasing into tokencard's docs.

---

## 10. Sources

**Competitive**
- https://github.com/sculptdotfun/viberank · https://www.viberank.app/
- https://www.claudeusage.com/ · https://github.com/bazarkua/claudeusage-sync
- https://github.com/anuraghazra/github-readme-stats (issues #1471, #4748, #4867)
- https://github.com/anmol098/waka-readme-stats
- https://contributing.shields.io/tutorial-production-hosting.html

**Hosting**
- https://developers.cloudflare.com/workers/platform/pricing/ · https://www.cloudflare.com/terms/
- https://vercel.com/docs/plans/hobby · https://vercel.com/docs/limits/fair-use-guidelines
- https://www.netlify.com/blog/introducing-netlify-free-plan/ · https://render.com/docs/free
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

**Databases**
- https://neon.com/docs/introduction/plans · https://neon.com/docs/introduction/scale-to-zero
- https://turso.tech/pricing
- https://supabase.com/pricing · https://supabase.com/docs/guides/platform/free-project-pausing
- https://upstash.com/docs/redis/overall/pricing
- https://xata.io/blog/changes-free-tier · https://planetscale.com/blog/planetscale-forever

**Other**
- https://docs.github.com/en/authentication/keeping-your-account-secure/about-anonymized-urls
- https://blog.cloudflare.com/expanding-our-support-for-oss-projects-with-project-alexandria/
- https://vercel.com/open-source-program · https://sentry.io/sponsorship/
