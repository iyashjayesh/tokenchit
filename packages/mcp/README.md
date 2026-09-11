# @tokenchit/mcp

MCP server for your local AI coding agent usage. Ask a model how many tokens you burned this
week instead of reading a table.

```json
{
  "mcpServers": {
    "tokenchit": { "command": "npx", "args": ["-y", "@tokenchit/mcp@latest"] }
  }
}
```

Reads the logs Claude Code, Codex and OpenCode already write on your machine. Node 22 or newer
— OpenCode support uses the built-in `node:sqlite`.

## Tools

| tool | what it answers |
| --- | --- |
| `get_usage` | totals, streak, active days, per-agent mix and per-model breakdown, over all time, the current calendar year so far, and the last 30 / 7 days |
| `get_daily_usage` | tokens per local calendar day for the last N days, idle days included as zero |
| `get_recap` | year in review for one calendar year — headline tiles, per-agent split, busiest hour range, activity by weekday and hour |
| `detect_agents` | which agents are on this machine, where each reads from, and what cannot be supported |

## It cannot make a network request

Not a policy sentence. `net.isolated` in `packages/cli/test/privacy.test.js` reads every source
file under `packages/mcp/src` and fails if any of them can open a socket — and unlike the CLI,
this package has **no allowlisted module at all**, so every file must be clean. It runs on
every push.

The ledger is read and never written. `tokenchit sync` banks what it saw because you asked it
to; a tool call is a question, and a question that mutates state on disk is a surprise you
cannot see or undo. Asking twice changes nothing.

## Two things the figures are not

**They will not match Claude Code's Stats panel.** Claude Code rewrites an assistant message in
the transcript as it streams, and each rewrite leaves a usage record carrying the same growing
figures — so one API call can appear several times. The panel sums them as written; this
deduplicates by message id. On the machines measured the panel ran 1.15x to 2.18x higher, and
the factor moved day to day, so there is no constant to divide out.

**Equivalent cost is not money you paid.** It is what the tokens would cost at list API rates.
Most agent usage runs under a subscription where no per-token charge ever happens, and models
with no public price are counted in the token total and left out of the cost figure. Every tool
returns that caveat as a field beside the number, because a figure handed to a model without
one gets reported to you as a bill.

## The rest of it

[`@tokenchit/cli`](https://www.npmjs.com/package/@tokenchit/cli) renders the same numbers as an
SVG card you commit to your repo, and optionally publishes a row to a public board. Source and
full docs: [github.com/iyashjayesh/tokenchit](https://github.com/iyashjayesh/tokenchit).

MIT.
