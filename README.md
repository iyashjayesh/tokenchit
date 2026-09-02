# tokencard

Marketing site and SVG card generator for **tokencard** — an open-source CLI that reads a
developer's local AI coding agent logs (Claude Code, Codex, Gemini CLI, Copilot CLI,
OpenCode) and turns them into an embeddable stat card for a GitHub README.

Built from the design handoff in [`design_handoff_tokencard_site/`](./design_handoff_tokencard_site).

Positioning, competitive landscape and infrastructure decisions (hosting, database,
anti-abuse) are researched and cited in [`docs/research.md`](./docs/research.md).

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

## The card endpoint

```
GET /api/card/<handle>.svg
```

| param | default | notes |
| --- | --- | --- |
| `layout` | `default` | `default` (495×195) or `compact` (340×195) |
| `theme` | `auto` | `auto` follows GitHub dark mode; force `light` or `dark` |
| `agents` | `all` | comma-separated allowlist, e.g. `claude-code,codex` |
| `hide` | — | drop any of `spend`, `streak`, `mix` |
| `cache` | `4h` | clamped 4h–24h |

Embed it:

```markdown
[![tokencard](https://tokencard.dev/api/card/dlacey.svg)](https://tokencard.dev/u/dlacey)
```

Markdown cannot place two images on one line, which is why the compact width exists:

```html
<img height="195" src="https://tokencard.dev/api/card/dlacey.svg">
<img height="195" src="https://tokencard.dev/api/card/dlacey.svg?layout=compact">
```

## Layout

```
app/
  layout.tsx                    fonts, 28px grid background, page container
  globals.css                   design tokens as CSS custom properties
  page.tsx                      composes the eight blocks
  api/card/[handle]/route.ts    SVG card endpoint
components/                     one .tsx + .module.css per section
lib/
  card-svg.ts                   shared SVG builder — page and endpoint both render through it
  sample-data.ts                placeholder board, agents, heatmap
```

Every figure on the site is placeholder sample data — realistic individual-developer
numbers, not real users.

## Conventions

- **Border radius is 0 everywhere.** Shadows are hard offsets only (`Npx Npx 0 c`), never blurred.
- **No media queries.** The layout is fluid: `clamp()`, `flex-wrap` with `flex: 1 1 <basis>`,
  and `min-width: min(100%, Npx)`. Wide tables scroll inside `overflow-x: auto` rather than
  reflowing into stacked cards.
- **One animation**, the blinking `▌` cursor after the install command. Nothing else moves.
- Two fonts, both via `next/font/google`: Bricolage Grotesque (h1, h2, wordmark, recap
  figures) and JetBrains Mono (everything else).

## Not built, deliberately

Spend-based tier ladders, pricing, a blog, a dark-mode toggle for the site itself, and any
per-row data-attestation chip on the board. Sign-in is local client state behind
`useSiteState()`, ready for a real GitHub OAuth provider.
