"use client";

import { useEffect, useRef, useState } from "react";

import { track } from "./analytics";
import styles from "./copy-button.module.css";

/**
 * Writes to the clipboard and swaps its label for 1400ms. Each instance owns its
 * timer, so the three copy buttons on the page never interfere with one another.
 *
 * Success is reported only when the write succeeded. It used to catch the rejection and say
 * "copied" regardless, on the reasoning that there was nothing useful to recover — but on an
 * insecure origin, with permission denied, or in a browser without the API, that sent someone
 * to their README to paste whatever was on the clipboard before. `ShareRow` already had this
 * right, and its comment names it: a false success is the worst failure available.
 */
export function CopyButton({
  value,
  variant,
  idleLabel = "copy",
  copiedLabel = "copied",
  event,
}: {
  value: string;
  variant: "ink" | "lime" | "yellow";
  idleLabel?: string;
  copiedLabel?: string;
  /** What was copied, for analytics. Omitted means the copy is not worth counting. */
  event?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onClick = async () => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      ok = false;
    }

    // Which snippet people take is the one thing worth knowing about this page: whether they
    // leave with the install command or with an embed for a card they already have.
    if (event) track("copy", { snippet: event, ok });

    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    /* The failure holds longer than the success. "copied" is a receipt for something the
       reader already believes happened; "select it instead" is an instruction they have to
       read, act on, and would lose if it vanished in the same 1.4 seconds. */
    timer.current = setTimeout(() => setState("idle"), ok ? 1400 : 4000);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={state === "failed" ? styles.failed : styles[variant]}
      /* Polite rather than assertive: a confirmation should not interrupt a screen reader
         mid-sentence, and the failure is not an emergency either. */
      aria-live="polite"
    >
      {state === "copied" ? copiedLabel : state === "failed" ? "select it instead" : idleLabel}
    </button>
  );
}
