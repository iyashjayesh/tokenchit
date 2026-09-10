#!/usr/bin/env node
import { byName, tools } from "./tools.js";

/*
 * The OpenCode adapter reads a SQLite database through `node:sqlite`, which is still flagged
 * experimental and prints a warning on load. It goes to stderr so it cannot corrupt the
 * protocol stream, but an MCP client surfaces stderr as the server's log, where an unexplained
 * warning on every start reads as a fault in this package. Only that one is dropped: removing
 * the default listener wholesale would hide deprecations worth seeing.
 */
{
  const warnings = process.listeners("warning");
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.name === "ExperimentalWarning" && /SQLite/i.test(warning.message)) return;
    for (const listener of warnings) listener(warning);
  });
}

/*
 * A stdio MCP server, written against the wire format rather than against the official SDK.
 *
 * The SDK is the normal choice and this is a deliberate departure: the whole claim this
 * package makes is that it cannot phone home, and `net.isolated` proves that by reading
 * source. A dependency tree moves most of the code out of reach of that test, so the trust
 * surface would grow by more than the SDK saves. What is actually needed here is three
 * request types over newline-delimited JSON-RPC, and that is small enough to audit.
 *
 * The one rule that matters: stdout carries protocol frames and nothing else. Every
 * diagnostic goes to stderr, or it corrupts the stream.
 */

/** Latest revision this server has been checked against. */
const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "tokenchit", version: "0.8.0" };

type Id = string | number | null;
type Request = { jsonrpc: "2.0"; id?: Id; method: string; params?: Record<string, unknown> };

const send = (msg: unknown): void => {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
};

const reply = (id: Id, result: unknown): void => send({ jsonrpc: "2.0", id, result });

const fail = (id: Id, code: number, message: string): void =>
  send({ jsonrpc: "2.0", id, error: { code, message } });

/** JSON-RPC codes, plus the one MCP adds for an unknown tool. */
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

async function handle(req: Request): Promise<void> {
  const id = req.id ?? null;
  const isNotification = req.id === undefined;

  switch (req.method) {
    case "initialize":
      reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          "Reads AI coding agent logs already on this machine. Every figure is local and " +
          "no tool here makes a network request. Token totals are deduplicated by message " +
          "id and will read lower than Claude Code's own Stats panel; equivalent cost is " +
          "list API rates, not money paid.",
      });
      return;

    // Sent by the client once it is ready. It carries no id and expects no answer; replying
    // to a notification is a protocol violation, not a harmless extra frame.
    case "notifications/initialized":
      return;

    case "ping":
      if (!isNotification) reply(id, {});
      return;

    case "tools/list":
      reply(id, {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
      return;

    case "tools/call": {
      const name = req.params?.name;
      if (typeof name !== "string") {
        fail(id, INVALID_REQUEST, "params.name is required");
        return;
      }

      const tool = byName.get(name);
      if (!tool) {
        fail(id, METHOD_NOT_FOUND, `unknown tool: ${name}`);
        return;
      }

      const args =
        req.params?.arguments && typeof req.params.arguments === "object"
          ? (req.params.arguments as Record<string, unknown>)
          : {};

      try {
        const out = await tool.run(args);
        reply(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (err) {
        /*
         * A tool that throws is reported through `isError` on a successful result, not as a
         * JSON-RPC error. The distinction is the point: a transport error is the server's
         * fault and the model cannot act on it, whereas "no logs on this machine" is an
         * answer the model should read and relay.
         */
        const message = err instanceof Error ? err.message : String(err);
        reply(id, { content: [{ type: "text", text: `tokenchit: ${message}` }], isError: true });
      }
      return;
    }

    default:
      // Unknown notifications are ignored by design — a client is allowed to send ones this
      // server has never heard of, and answering them would be the bug.
      if (!isNotification) fail(id, METHOD_NOT_FOUND, `unknown method: ${req.method}`);
  }
}

/*
 * Frame on newlines, and buffer whatever arrives mid-line.
 *
 * stdin delivers arbitrary chunks, so a frame can be split across two reads and two frames
 * can arrive in one. Parsing per chunk works right up until a payload gets big enough to be
 * split, which is exactly when a recap of a large corpus goes out.
 */
let buffer = "";

/*
 * In-flight tool calls, so shutdown can wait for them.
 *
 * Without this, `process.exit` on stdin end tore down the process while a `tools/call` was
 * still reading logs, and the reply was never written — reproducible by piping requests in
 * rather than holding the pipe open, which is also how anyone first tries this by hand.
 */
let pending = 0;
let inputEnded = false;

const settle = (): void => {
  if (inputEnded && pending === 0) process.exit(0);
};

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;

  let cut = buffer.indexOf("\n");
  while (cut !== -1) {
    const line = buffer.slice(0, cut).trim();
    buffer = buffer.slice(cut + 1);
    cut = buffer.indexOf("\n");

    if (!line) continue;

    let req: Request;
    try {
      req = JSON.parse(line) as Request;
    } catch {
      fail(null, PARSE_ERROR, "invalid JSON");
      continue;
    }

    // Requests are handled in arrival order but not serialised: a client may pipeline, and
    // each reply carries its own id.
    pending += 1;
    void handle(req)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        fail(req.id ?? null, INTERNAL_ERROR, message);
      })
      .finally(() => {
        pending -= 1;
        settle();
      });
  }
});

// The client closing stdin is the shutdown signal; there is no separate exit handshake.
// Exiting is deferred until every accepted request has answered, so a reply is never lost
// to the shutdown that arrived behind it.
process.stdin.on("end", () => {
  inputEnded = true;
  settle();
});
