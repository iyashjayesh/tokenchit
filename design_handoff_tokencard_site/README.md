# Handoff: tokencard marketing site + card generator

## Overview

A single-page marketing site for **tokencard**, an open-source CLI that reads a developer's
local AI coding agent logs (Claude Code, Codex, Gemini CLI, Copilot CLI, OpenCode) via
`ccusage` and turns them into an embeddable SVG stat card for a GitHub README, plus a
year-in-review recap page and an opt-in public leaderboard.

Three product pillars, in priority order:

1. The README embed is the growth loop.
2. Verification tiers are the differentiator.
3. Privacy is structural, not promised.

Sign-in with GitHub does three things and no more: proves the account is real, enables the
hosted card endpoint, and opts the user into the public board.

## About the design files

The files in this bundle are **design references created in HTML**. They are prototypes
showing intended look and behavior — not production code to copy directly. The task is to
recreate them in Next.js using that project's conventions (App Router, your component
library, your styling approach). Do not port the markup verbatim.

Two files are included:

| File | What it is |
| --- | --- |
| `Tokencard Site v2.dc.html` | **The design to build.** Current, approved direction. |
| `reference-crt-version.dc.html` | An earlier CRT/phosphor-terminal exploration. Context only — do not build. |

Both are "Design Component" HTML files: a template plus a small logic class, rendered by a
runtime that is specific to the design tool. Open them in a browser to view. Ignore the
`support.js` runtime, the `<x-dc>` wrapper, `{{ hole }}` template syntax and `sc-for` /
`sc-if` tags — those are authoring conveniences, not part of the design. Read them as
"markup + inline styles + a data model."

## Fidelity

**High fidelity.** Final colors, typography, spacing and interactions. Recreate pixel-close.
Every number displayed is placeholder sample data — realistic individual-developer figures,
not real users.

---

## Design tokens

### Color

| Token | Hex | Use |
| --- | --- | --- |
| `ink` | `#101010` | All text, all borders, hard shadows, filled buttons |
| `paper` | `#FFFDF9` | Page background |
| `surface` | `#FFFFFF` | Cards, panels, table bodies |
| `surface-alt` | `#F5F4EE` | Panel headers, muted chips |
| `grid` | `#F0EFE9` | 28px background grid lines, empty bar tracks |
| `lime` | `#C6FF3D` | Primary accent: verified marks, largest bar segment, active states |
| `coral` | `#FF5C3D` | Secondary accent: sign-in button, streak figure, peak marker |
| `yellow` | `#FFD23D` | Tertiary accent: medals, "opt-in" chip, one shadow |
| `text-muted` | `#55554E` | Body copy inside panels |
| `text-dim` | `#8A8A82` | Labels, captions, footnotes |
| `text-faint` | `#A5A59D` | Card stat labels |
| `hairline` | `#E4E2D8` | 1px rules inside cards |
| `card-footer` | `#C0BEB6` | Card footer line |
| `alert` | `#C43A20` | "Does not prove" column |
| `dark-bg` | `#101010` | Dark card + privacy panel |
| `dark-border` | `#2E2E28` | Dark card frame |
| `dark-dim` | `#6E6E66` | Dark card labels |
| `dark-body` | `#9A9A92` | Dark panel body copy |

Bar segment greys (light card): `#101010`, `#8A8A82`, `#D8D6CE`.
Bar segment greys (dark card): `#FFFFFF`, `#6E6E66`, `#3A3A34`.
Heatmap ramp, low to high: `#F5F4EE`, `#E7F5BE`, `#C6FF3D`, `#FFD23D`, `#FF5C3D`.
Medals, rank 1–3: `#FFD23D`, `#E4E2D8`, `#F0B37E`.

### Typography

Two families, both from Google Fonts.

- **Display** — Bricolage Grotesque, weights 600 and 800. Used *only* for `h1`, `h2`, the
  wordmark, and the four big recap stat figures. Always `letter-spacing: -.03em` to `-.04em`.
- **Everything else** — JetBrains Mono, weights 400/500/700/800. All body copy, all tables,
  all labels, all data, all buttons.

There is no third font and no system sans anywhere.

| Role | Size | Weight | Tracking |
| --- | --- | --- | --- |
| h1 | `clamp(34px, 4.6vw, 58px)` | 800 | `-.04em`, line-height 1.02 |
| h2 (section) | `clamp(24px, 2.8vw, 34px)` | 800 | `-.03em` |
| Body | 13–13.5px | 400 | normal, line-height 1.75–1.8 |
| Table cell | 12.5px | 400/700 | normal |
| Section label `[ 01 ]` | 10px | 700 | `.14em`, uppercase |
| Small label / chip | 9.5–10px | 700 | `.12em–.14em`, uppercase |
| Card stat value | 30px | 800 | `-.02em` |
| Card stat label | 8.5px | 700 | `.18em`, uppercase |
| Card footer | 8px | 400 | `.14em`, uppercase |

### Geometry

- **Border radius: 0 everywhere.** No exceptions.
- Borders: `2px solid #101010` for panels, buttons, cards, table outlines. `3px` for section
  dividers and the table header underline. `1px solid #E4E2D8` for hairlines inside cards.
- Shadows are **hard offsets only**, never blurred: `Npx Npx 0 <color>`. Sizes used: 3px
  (small chips), 4px (buttons), 5px (panels), 6px (large panels). Shadow color varies —
  `#101010`, `#C6FF3D`, `#FFD23D` — and is a deliberate accent choice per panel.
- Page grid background:
  `linear-gradient(#F0EFE9 1px, transparent 1px), linear-gradient(90deg, #F0EFE9 1px, transparent 1px)`
  at `background-size: 28px 28px`.
- Content max width `1180px`, horizontal padding `clamp(16px, 3vw, 32px)`.
- Section vertical padding `clamp(30px, 4vw, 56px)`, separated by `3px solid #101010`.
- Sticker rotations: a few chips carry `transform: rotate(-1.5deg)` to `rotate(1.2deg)`.
  Used sparingly — three chips in the hero, one on the board heading.

---

## Screens / views

One page, seven blocks in this order.

### 1. Header (sticky-less, top of page)

Left: wordmark `tokencard` — Bricolage Grotesque 800, 16px, in a lime box with 2px ink border
and `3px 3px 0 #101010` shadow, padding `7px 11px`. Beside it, `V0.4.1 · MIT` at 9px/700/`.14em`
in `#8A8A82`.

Right: nav (`card`, `board`, `verify`, `privacy`, `recap`) at 10.5px/700/`.1em` uppercase,
gap `clamp(10px, 1.4vw, 18px)`, hover → coral. Then the auth control.

**Signed out** — coral button, white text, 2px ink border, `4px 4px 0 #101010`, padding
`10px 16px`, 11px/700/`.08em` uppercase, GitHub mark 15px inline at gap 9px. Label:
`sign in with github`.
Hover: shadow shrinks to `2px 2px 0` and the button translates `(2px, 2px)`.
Active: shadow `0 0 0`, translate `(4px, 4px)`. This press physics is used on this button only.

**Signed in** — white pill, 2px ink border, `3px 3px 0 #C6FF3D`. Contains a 15px lime square
with a `✓`, then `@handle` at 10px/700 uppercase, then a small ink `out` button.

### 2. Hero

Two columns, `flex-wrap: wrap`, gap `clamp(24px, 4vw, 52px)`. Left `flex: 1 1 420px`,
right `flex: 0 1 500px`.

**Left column**

- Three chips in a row, gap 8px, each slightly rotated: `5 agents` (ink bg, lime text),
  `parsed locally` (yellow bg, 2px border), `no prompts sent` (white bg, 2px border).
- `h1`: "Receipts for / your **robots.**" — "robots." is wrapped in a lime box with 2px border
  and `4px 4px 0 #101010`, rotated `-1deg`, padding `0 8px`.
- Body paragraph, 13.5px, `#55554E`, max-width 36em.
- Install block: white, 2px ink border, `6px 6px 0 #C6FF3D`, max-width 440px. Inside, a flex
  row: `<code>` with `$ ` in `#A5A59D` then `npx tokencard init`, followed by a blinking `▌`
  block cursor (1.06s `step-end` infinite, 50% opacity flip). Right, a full-height ink button
  reading `copy`, lime text, hover → coral background with white text. On click, label swaps
  to `copied` for 1400ms.

**Right column — live preview card**

Label row: `live preview` at 10px/700/`.14em` in `#8A8A82`.

Then the card. **Important implementation note:** this preview must be built in **HTML/CSS**,
not SVG. It mirrors the SVG card's geometry but its handle is live-bound to the input below
it. (In the prototype an SVG version of this was tried and the dynamic text would not render —
a text node injected into `<svg><text>` does not lay out. Keep the interactive one in HTML and
the static ones as SVG.)

Below the card: `handle` label plus a text input — white, 2px ink border, 12.5px, focus adds
`3px 3px 0 #FFD23D`. Input sanitises to `[A-Za-z0-9_-]`, max 16 chars, falls back to `dev`
when emptied. It drives the preview card's handle **and** both embed snippets in section 01.

### 3. Section 01 — "The card, up close"

Section heading pattern used by every numbered section: a `[ 0N ]` chip (ink bg / lime text,
or coral bg / white text on even sections) beside an `h2`, both baseline-aligned, gap 14px.

Intro paragraph explains: default 495×195, `layout=compact` is 340 wide so two cards fit on
one README line, theme follows GitHub dark mode by media query, every card carries its last
sync timestamp because the endpoint caches for four hours.

Row A — two cards side by side, each labelled above in 9.5px/700/`.14em` `#8A8A82` plain text
(`variant / light`, `variant / dark`).

Row B — the compact card (labelled `layout=compact · 340px`) beside a **query options** panel:
white, 2px border, `5px 5px 0 #101010`, header strip `#F5F4EE` with a 2px underline reading
`query options`. Five rows, each `key / default / description`, separated by
`1px solid #E4E2D8`:

| key | default | note |
| --- | --- | --- |
| `layout` | `default` | default (495px) or compact (340px) |
| `theme` | `auto` | auto follows GitHub dark mode; force light or dark |
| `agents` | `all` | comma-separated allowlist, e.g. claude-code,codex |
| `hide` | `—` | drop any of spend, streak, mix from the card |
| `cache` | `4h` | clamped 4h–24h, same as the rest of the genre |

Row C — two embed snippets side by side, each a panel with a header strip and its own copy
button (lime button on the markdown panel, yellow on the HTML panel; both swap to `copied ✓`
for 1400ms):

- **markdown** — `[![tokencard](https://tokencard.dev/api/card/<handle>.svg)](https://tokencard.dev/u/<handle>)`
- **html · two cards on one line** — two `<img height="195" src="…">` tags, the second with
  `?layout=compact`.

Footnote: markdown cannot place two images on one line; the HTML form is the only way, which
is why the compact width exists.

### 4. Section 02 — "The board"

Heading carries a rotated yellow `opt-in` chip.

Intro: public ranking of signed-in developers who chose to publish; leaving removes the row
within the hour.

Filter row: four buttons — `this year`, `last 30d`, `last 7d`, `all time`. Inactive = white,
2px ink border, no shadow. Active = ink background, lime text, `3px 3px 0 #C6FF3D`. Currently
cosmetic; wire to a real query.

Table: white, 2px ink border, `6px 6px 0 #101010`, `overflow-x: auto`, `min-width: 880px`.
Header row is **ink background, white text**, 9.5px/700/`.14em` uppercase. Body rows separated
by `2px solid #101010`.

Columns: `rank` (64px) · `developer` · `agent mix` (190px) · `tokens` (100px, right) ·
`spend` (110px, right) · `streak` (90px, right, coral, bold).

- Rank cell: a 26px minimum-width square, 2px ink border, weight 800. Ranks 1–3 use the medal
  fills; the signed-in user's own row uses lime; everyone else white.
- Developer cell: `@handle` bold, then a 16px lime square containing `✓` with a 1.5px ink
  border and `title="GitHub identity verified"`. There is **no** per-row data-tier chip — it
  was removed deliberately; identity and data attestation are different claims and mixing two
  badges in one row confused people.
- Agent mix cell: a 12px-tall flex bar with a 1.5px ink border, four segments flexed by the
  row's mix percentages, colored lime / coral / yellow / white.
- The signed-in user's row is tinted `#FBFFF0`.

Sample rows (placeholder data, in rank order):

| # | handle | tokens | spend | streak | mix |
| --- | --- | --- | --- | --- | --- |
| 1 | mirak | 8.91B | $2,740 | 211d | 64/18/10/8 |
| 2 | p-han | 7.32B | $2,118 | 96d | 41/34/15/10 |
| 3 | sunnyv | 6.05B | $1,802 | 154d | 72/9/12/7 |
| 4 | dlacey | 4.24B | $1,284 | 63d | 58/21/12/9 |
| 5 | ottoline | 3.88B | $1,090 | 41d | 30/44/14/12 |
| 6 | kmerrit | 3.10B | $946 | 88d | 55/20/18/7 |
| 7 | bex_c | 2.47B | $714 | 129d | 48/12/26/14 |
| 8 | nlundq | 1.96B | $538 | 22d | 22/51/9/18 |

Footnote: rank is total tokens over the selected window, a usage count and not a skill score;
every listed developer has a verified GitHub identity.

> Note for product: rows 1–2 exceed the "individual developer" sample range the brief set
> (single-digit billions, hundreds to low thousands of dollars). Confirm before shipping real
> copy.

### 5. Section 03 — "Two different marks"

Intro states the distinction plainly: the lime `✓ GITHUB` mark means the account is real and
the handle belongs to them, and says nothing about the numbers; the tier below is what speaks
to the data.

Table: white, 2px ink border, `6px 6px 0 #FFD23D`, `min-width: 860px`. Header strip
`#F5F4EE` with a 2px ink underline. Columns: `tier` (170px) · `method` (180px) · `proves` ·
`does not prove` (header in coral, cells in `#C43A20`).

Three rows; the tier cell holds a bordered chip — `○ self-reported` on `#F0EFE9`,
`◈ device-attested` on lime (row tinted `#FBFFF0`), `◆ api-verified` on yellow.

Copy is deliberately honest and must not be softened:

- **self-reported** / one-shot upload of a locally parsed summary.
  Proves: the file was produced by the CLI on some machine, at the stated time.
  Does not prove: nothing about the numbers; logs can be edited before parsing; treat as a claim.
- **device-attested** / continuous signed daily deltas, hash-chained.
  Proves: deltas arrived daily from one keypair, in order, with no gaps or retroactive edits;
  tampering breaks the chain and is visible.
  Does not prove: that the logs themselves are real; a patched client on a controlled machine
  can still sign fabricated deltas.
- **api-verified** / read-only org analytics API, provider-side.
  Proves: token and spend totals match the provider's own billing records for the connected account.
  Does not prove: coverage; only agents behind that provider are counted, and the per-agent
  split still comes from local logs.

Footnote: no tier distinguishes tokens spent on work from tokens spent on nothing. The card
measures usage, not output.

### 6. Section 04 — "Enforced by the test suite"

An **ink-background** panel, 2px ink border, `6px 6px 0 #C6FF3D`. Header strip with a
`2px solid #C6FF3D` underline reading `privacy.spec.ts` in lime.

Body renders as passing test output: four rows, each `✓` (lime, 800) · test name (lime, 700) ·
description (`#9A9A92`, flexes) · duration (`#6E6E66`). Line-height 2.05.

| test | description | ms |
| --- | --- | --- |
| `paths.hashed` | project paths hashed locally with a device-only salt; the salt never leaves disk | 4ms |
| `dryrun.exact` | `--dry-run` prints the byte-identical payload that would be uploaded | 11ms |
| `payload.noContent` | no prompts, completions, file contents or diffs appear in any emitted field | 7ms |
| `net.isolated` | build fails if any network call originates outside `src/upload/` | 63ms |

Summary line above a `1px solid #3A3A34` rule: `4 passing (85ms) · 0 failing`.

### 7. Section 05 — "Year in review"

Four stat tiles, `flex: 1 1 210px`, each 2px ink border with `5px 5px 0 #101010`, padding 18px.
Figures in Bricolage Grotesque 800 at `clamp(28px, 3.2vw, 40px)`.

| tile | value | fill |
| --- | --- | --- |
| total tokens | 4.24B | lime |
| total spend | $1,284.60 | white |
| top model | claude-sonnet-4-5 (18px, mono) | white |
| longest streak | 63d | coral, white text |

**Per-agent breakdown** panel (`6px 6px 0 #FFD23D`): a table, `min-width: 620px`, rows split
by `2px solid #101010`. Columns: agent · share · tokens (right) · cost (right). The share cell
holds a 14px-tall track (`#F5F4EE`, 2px ink border) with a fill at the agent's percentage,
then the percentage in `#8A8A82`.

| agent | share | tokens | cost | fill |
| --- | --- | --- | --- | --- |
| claude-code | 58% | 2.46B | $742.10 | lime |
| codex | 21% | 890M | $268.40 | coral |
| gemini-cli | 12% | 508M | $151.20 | yellow |
| copilot-cli | 9% | 382M | $122.90 | ink |
| opencode | 0% | — | — | ink |

**Activity by day and hour** panel (`6px 6px 0 #101010`), `min-width: 600px`:

- Seven rows, one per weekday. Each row: a 36px day label (9.5px/800/`.1em`) · a flex "tray"
  with `2px solid #101010`, ink background and 2px padding, holding 24 hour cells at
  `gap: 2px`, each `flex: 1`, 17px tall, colored from the ramp — the ink tray and gaps are the
  grid rules, so cells carry no borders of their own · a 96px right group holding a 44px
  mini-bar (share of the busiest day) and the day's token total.
- The busiest day's label goes ink and its bar coral; other days are `#8A8A82` / lime.
- Below the grid: a continuous coral bar (no gaps) spanning hour columns 14–19 marking the
  peak window, then 9px of clearance, then hour labels every third hour (`00`, `03`, … `21`)
  aligned to their columns. A `day total` caption sits over the right group.
- Legend top-right: `less` · five 14px ramp swatches with 1.5px ink borders · `more`.
- Caption: peak block Tue–Thu, 14:00–19:00 local, derived from log timestamps only.

Day totals must be computed from the **unrounded** activity value, then formatted — quantising
to the five colour levels first makes several days collapse onto identical figures, which
reads as a rendering bug.

### 8. Footer

Three link chips (`github.com/tokencard`, `npm / tokencard`, `self-host docs`) — white, 2px
ink border, `3px 3px 0 #101010`, 10.5px/700/`.1em` uppercase. Right: `MIT License · © 2026
tokencard contributors` at 10px/700/`.14em` in `#8A8A82`.

---

## The stat card artifact

The card is the product's growth loop, so it ships as a **real SVG served from an endpoint**,
not as HTML. Two sizes, two themes.

### Default — 495 × 195

```
┌─────────────────────────────────────────────────────┐
│  @dlacey                                            │  ← 20px / 800, at x=28 y=44
│  ─────────────────────────────────────────────────  │  ← 1px #E4E2D8 hairline, y=62
│  TOKENS          SPEND           STREAK             │  ← 8.5px / 700 / .18em, y=88
│  4.24B           $1,284          63d                │  ← 30px / 800, y=122
│  ████████████████▓▓▓▓▓▒▒▒░░                         │  ← 6px bar, y=138
│  ■ claude-code 58%  ■ codex 21%  ■ …                │  ← 8.5px legend, y=163
│  TOKENCARD.DEV                      SYNCED 2H AGO   │  ← 8px / .14em, y=182
└─────────────────────────────────────────────────────┘
```

Exact coordinates, light theme:

- Frame: `rect x=1 y=1 w=493 h=193`, fill `#FFFFFF`, stroke `#101010`, stroke-width 2.
- Handle: `x=28 y=44`, 20px, weight 800, `#101010`.
- Hairline: `x1=28 y1=62 x2=467 y2=62`, `#E4E2D8`, 1px.
- Stat labels at `y=88`, x = 28 / 184 / 340, 8.5px, weight 700, letter-spacing 1.8, `#A5A59D`.
- Stat values at `y=122`, same x, 30px, weight 800, `#101010`. **Streak is not colored** on the
  card — the only accent is the mix bar.
- Mix bar at `y=138`, height 6, from x=28 to x=467 (439 wide): segments 255 / 92 / 53 / 39 px
  in `#C6FF3D` / `#101010` / `#8A8A82` / `#D8D6CE`.
- Legend at `y=157` (6px swatches) and `y=163` (8.5px text, `#55554E`), swatch/text x pairs:
  28/40, 150/162, 260/272, 372/384.
- Footer at `y=182`, 8px, letter-spacing 1.4, `#C0BEB6`: `TOKENCARD.DEV` left at x=28,
  `SYNCED 2H AGO` right-anchored at x=467.

Dark theme: same geometry. Fill `#101010`, stroke `#2E2E28`, handle and values `#FFFFFF`,
hairline `#2E2E28`, labels `#6E6E66`, legend text `#9A9A92`, footer `#55554E`, bar segments
`#C6FF3D` / `#FFFFFF` / `#6E6E66` / `#3A3A34`.

### Compact — 340 × 195

Same frame and footer. Handle 18px at `x=24 y=40`. Hairline at `y=56`, x 24→316. Three
label/value **rows** instead of columns — label left at 8.5px, value right-anchored at x=316
in 19px/800 — with baselines at y=82 / 112 / 142 and `1px #F0EFE9` rules between at y=95.5 and
y=125.5. Mix bar at `y=156`, height 6, x 24→316 (292 wide): 169 / 61 / 35 / 27 px. No legend —
the bar carries the split. Footer at `y=180`.

The card must stay legible at 100% scale inside a GitHub README; nothing on it is below 8px.

---

## Interactions & behavior

| Interaction | Behavior |
| --- | --- |
| Sign in with GitHub | Swaps the header control to the signed-in pill. In the prototype this is local state; wire to a real OAuth flow. |
| Sign out | Returns to the button. |
| Handle input | Sanitises to `[A-Za-z0-9_-]`, caps at 16 chars, empty falls back to `dev`. Live-updates the hero preview card and both embed snippets. |
| Copy buttons (×3) | Write to clipboard, swap label to `copied` / `copied ✓` for 1400ms, then revert. Each has its own timer. |
| Board window filters | Single-select; active gets ink fill + lime shadow. Cosmetic in the prototype. |
| Nav links | In-page anchors to `#card`, `#board`, `#verification`, `#privacy`, `#recap`. |
| Hover states | Links → coral. Sign-in button → shadow shrink + translate. Copy buttons → inverted fill. |

**Animation is limited to one thing on purpose:** the blinking `▌` cursor after the install
command. Nothing else animates on load. Keep it that way.

## State

| State | Type | Notes |
| --- | --- | --- |
| `username` | string | Default `dlacey`. Drives preview card, both snippets, and highlights the matching board row. |
| `signedIn` | boolean | Header control only. |
| `window` | enum | `this year` (default) · `last 30d` · `last 7d` · `all time`. |
| `copied.{install,embed,html}` | boolean | Each with an independent 1400ms timer. |

Data the real app must fetch: the board rows for the selected window, and the signed-in user's
own totals, agent mix, sync timestamp and verification tier.

## Responsive

Desktop-first at 1440px; verified at 375px. No media queries are used — the layout is fluid:

- `clamp()` on every heading size, section padding and gap.
- `flex-wrap: wrap` with `flex: 1 1 <basis>` on all multi-column rows.
- `min-width: min(100%, Npx)` on columns so they collapse rather than overflow.
- Every wide table sits in an `overflow-x: auto` wrapper with a `min-width` on the table, so
  tables scroll horizontally on mobile instead of reflowing. Keep this — reflowing these
  tables into stacked cards would break the dense-data reading the design depends on.
- Cards use `width: 100%; max-width: 495px` with `height: auto` on the SVG.

## Assets

- **Fonts** — Bricolage Grotesque (600, 800) and JetBrains Mono (400, 500, 700, 800), both
  Google Fonts. In Next.js use `next/font/google` and expose them as CSS variables rather than
  a `<link>`.
- **GitHub mark** — inline 16×16 SVG path, `fill="currentColor"`. Included in the prototype
  markup; lift it as-is.
- **No image assets.** Everything else is CSS or inline SVG.

## Suggested Next.js structure

Not prescriptive — follow your own conventions if they differ.

```
app/
  layout.tsx            fonts, grid background, global tokens
  page.tsx              composes the seven sections
  api/card/[handle]/route.tsx   SVG card endpoint
components/
  site-header.tsx       nav + auth control
  hero.tsx              chips, h1, install block, live preview
  stat-card.tsx         HTML preview card (interactive)
  card-section.tsx      static SVG cards, options table, snippets
  leaderboard.tsx       filters + table
  verification.tsx      tier table
  privacy.tsx           test output panel
  recap.tsx             tiles, agent breakdown, activity grid
  copy-button.tsx       clipboard + 1400ms label swap
lib/
  card-svg.ts           shared SVG builder for both layouts and themes
  sample-data.ts        placeholder board, agents, heatmap
```

Two notes on the card endpoint. Build the SVG as a string from one function parameterised by
`{handle, tokens, spend, streak, mix, syncedAt, layout, theme}`, so the page and the endpoint
cannot drift apart. Serve it with `Cache-Control: public, max-age=14400, s-maxage=14400` to
match the four-hour figure printed on the card, and embed the fonts as `font-family` fallbacks
(`'JetBrains Mono', ui-monospace, monospace`) — GitHub strips `<style>` and external font
references from README SVGs, so do not rely on a webfont loading inside the card.

## Do not build

Explicitly out of scope, decided during design: tier ladders based on spend, pricing, a blog,
a dark-mode toggle for the site itself, and any per-row data-attestation chip on the board.

## Files in this bundle

| File | Notes |
| --- | --- |
| `Tokencard Site v2.dc.html` | The approved design. Open in a browser. |
| `reference-crt-version.dc.html` | Earlier CRT exploration, context only. |
| `README.md` | This document. |
