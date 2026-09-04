/**
 * Terminal output helpers.
 *
 * Colour is dropped whenever stdout is not a TTY or `NO_COLOR` is set, because `sync` is
 * meant to run in CI as readily as in a shell, and escape codes in an Actions log help
 * nobody.
 *
 * Anything decorative — spinners, rules, panels — goes to stderr. stdout carries only what a
 * caller might parse: the JSON from `--json`, the payload bytes from `--dry-run`. That split
 * is what lets `tokenchit sync --json | jq` stay usable while the same command draws a
 * progress line for a human.
 */
const ESC = "\u001b";

const colour = Boolean(process.stdout.isTTY) && !process.env["NO_COLOR"];

/** Animation needs a TTY to erase what it drew; a pipe or a CI log gets static text. */
export const animated = Boolean(process.stderr.isTTY) && !process.env["NO_COLOR"];

const wrap = (code: string) => (s: string) => (colour ? `${ESC}[${code}m${s}${ESC}[0m` : s);

export const bold = wrap("1");
export const dim = wrap("2");
export const green = wrap("32");
export const yellow = wrap("33");
export const red = wrap("31");
export const cyan = wrap("36");
export const magenta = wrap("35");
export const grey = wrap("90");

/* The brand lime, as foreground. 256-colour index 154 rather than truecolor: it is what the
   widest set of terminals actually render, and nobody could pick it from #C6FF3D. */
export const lime = (s: string) => (colour ? `${ESC}[38;5;154m${s}${ESC}[0m` : s);

export const say = (s = "") => process.stdout.write(`${s}\n`);
export const note = (s = "") => process.stderr.write(`${s}\n`);
export const warn = (s: string) => process.stderr.write(`${yellow("!")} ${s}\n`);
export const fail = (s: string) => process.stderr.write(`${red("✗")} ${s}\n`);

const ANSI = new RegExp(`${ESC}\\[[0-9;]*m|${ESC}\\]8;;[^${ESC}]*${ESC}\\\\`, "g");

/** Printable width, ignoring colour codes and hyperlink wrappers, so columns line up. */
export const width = (s: string) => [...s.replace(ANSI, "")].length;

export const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - width(s)));
export const padStart = (s: string, n: number) => " ".repeat(Math.max(0, n - width(s))) + s;

/**
 * A real terminal hyperlink where the terminal supports OSC 8, and a plain URL everywhere
 * else. The URL is never hidden behind a label alone — someone reading this in a terminal
 * without OSC 8, or scrolling back through a log, still gets something they can copy.
 */
export function link(url: string): string {
  if (!colour) return url;
  return `${ESC}]8;;${url}${ESC}\\${cyan(url)}${ESC}]8;;${ESC}\\`;
}

/* The site's wordmark, in a terminal. Lime block, black text, the same mark someone saw on
   the page they installed this from — a CLI and its site looking like two products is a
   surprisingly cheap thing to get wrong.

   256-colour rather than truecolor: it is what the widest set of terminals actually render,
   and the brand lime is close enough at index 154 that nobody could pick the difference. */
export function wordmark(): string {
  if (!colour) return "tokenchit";
  return `${ESC}[48;5;154m${ESC}[38;5;16m${ESC}[1m tokenchit ${ESC}[0m`;
}

/*
 * The site's hero chips, in a terminal. They answer "what is this about to read, and does it
 * leave my machine" before anyone has to ask, which is the same job they do on the page.
 *
 * Reverse video rather than a drawn border: it survives every terminal, needs no box-drawing
 * characters, and keeps the row one line tall.
 */
const CHIP_STYLES = {
  ink: "48;5;16;38;5;231",
  lime: "48;5;154;38;5;16",
  yellow: "48;5;220;38;5;16",
} as const;

export function chip(text: string, style: keyof typeof CHIP_STYLES = "ink"): string {
  const label = text.toUpperCase();
  if (!colour) return `[${label}]`;
  return `${ESC}[${CHIP_STYLES[style]}m ${label} ${ESC}[0m`;
}

/**
 * The left rule that groups a step's output under its heading.
 *
 * Lime while the step is running, grey once it is done, so a glance down the left edge says
 * how far along the command is without reading a word of it.
 */
export const gutter = (done = false) => (done ? grey("┃") : lime("┃"));

/** `[1/3] label` — the spine of a multi-step command, so progress is legible at a glance. */
export function step(n: number, total: number, label: string): string {
  // Uppercase, like the micro-labels on the card and the profile page. A CLI and its site
  // sharing a typographic voice is most of what makes them feel like one product.
  return `  ${gutter()} ${grey(`[${n}/${total}]`)}  ${bold(label.toUpperCase())}`;
}

/** Indent a line into a step's gutter. */
export const under = (text: string, done = false) => `  ${gutter(done)}   ${text}`;

/** The line that closes a step: a tick in the gutter, then what happened. */
export const done = (text: string) => `  ${green("✓")} ${text}`;

/** A full-width rule, clamped like the stats panel so the two agree. */
export function rule(): string {
  const w = Math.max(64, Math.min(84, (process.stdout.columns ?? 80) - 4));
  return `  ${dim("─".repeat(w - 2))}`;
}

const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/** A sparkline scaled to its own maximum. A zero day stays a dot, so gaps read as gaps. */
export function sparkline(values: number[]): string {
  const max = Math.max(...values, 0);
  if (max <= 0) return grey("·".repeat(values.length));
  return values
    .map((v) => {
      if (v <= 0) return grey("·");
      const i = Math.min(BLOCKS.length - 1, Math.floor((v / max) * BLOCKS.length));
      return BLOCKS[i]!;
    })
    .join("");
}

/** A proportional bar. Eighth-blocks so a small share still shows something. */
export function bar(fraction: number, cells: number): string {
  const filled = Math.max(0, Math.min(1, fraction)) * cells;
  const whole = Math.floor(filled);
  const rest = filled - whole;
  const partial = rest > 0.05 ? BLOCKS[Math.min(7, Math.floor(rest * 8))]! : "";
  const drawn = "█".repeat(whole) + partial;
  // A share that rounds below one eighth of a cell still happened. Rendering it as nothing
  // puts a labelled 0.2% row beside a blank bar, which reads as a bug rather than as small.
  return drawn === "" && fraction > 0 ? "▏" : drawn;
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export type Spinner = {
  update: (label: string) => void;
  done: (label?: string) => void;
  stop: () => void;
};

/**
 * A spinner that degrades to a single static line.
 *
 * Reading a few thousand transcripts takes long enough that silence reads as a hang, which
 * is the actual problem this solves. Without a TTY it prints the label once and nothing
 * after, so a CI log gets one line rather than a thousand frames.
 */
export function spin(label: string): Spinner {
  if (!animated) {
    process.stderr.write(`  ${label}\n`);
    return { update: () => {}, done: () => {}, stop: () => {} };
  }

  let text = label;
  let i = 0;
  const draw = () => {
    process.stderr.write(`\r${ESC}[2K  ${cyan(FRAMES[i++ % FRAMES.length]!)} ${text}`);
  };
  draw();
  const timer = setInterval(draw, 80);
  // Unref'd so a spinner can never be the reason a process stays alive.
  timer.unref?.();

  const clear = () => {
    clearInterval(timer);
    process.stderr.write(`\r${ESC}[2K`);
  };

  return {
    /*
     * Redraws immediately rather than waiting for the next frame.
     *
     * A label that changes and reverts inside one 80ms tick is never drawn at all, which is
     * how a fast adapter can finish invisibly and leave the previous one's name on screen —
     * so a hang in the quiet one would be blamed on the loud one. Terminal writes are cheap;
     * being wrong about where the time is going is not.
     */
    update: (next: string) => {
      text = next;
      draw();
    },
    done: (final?: string) => {
      clear();
      if (final) process.stderr.write(`  ${green("✓")} ${final}\n`);
    },
    stop: clear,
  };
}

/**
 * Node 22 prints an ExperimentalWarning the first time `node:sqlite` loads. It is true but
 * not actionable by the person running `tokenchit sync`, and it lands in the middle of the
 * output. Every other warning is re-emitted so nothing real is swallowed.
 */
export function muteSqliteWarning(): void {
  const listeners = process.listeners("warning");
  for (const l of listeners) process.removeListener("warning", l);

  process.on("warning", (w) => {
    if (w.name === "ExperimentalWarning" && /SQLite/i.test(w.message)) return;
    for (const l of listeners) l(w);
    if (listeners.length === 0) process.stderr.write(`${w.name}: ${w.message}\n`);
  });
}
