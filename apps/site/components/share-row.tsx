"use client";

import { useEffect, useRef, useState } from "react";

import { track } from "@/components/analytics";
import styles from "./share-row.module.css";

/**
 * One button: copy the post, then say so beside it.
 *
 * The obvious build is a row of platform buttons, and it cannot be done honestly. X takes
 * prefilled text through its intent endpoint; LinkedIn takes a URL and nothing else, because
 * the parameters that carried text were removed and the API that composes a post needs a
 * member OAuth token a site with no browser session cannot hold; Instagram has no web post
 * intent at all and strips links from captions. A row of four would work as advertised on one.
 *
 * Copying sidesteps that: the clipboard is the one interface every platform accepts, and the
 * person is going to their app anyway.
 *
 * The confirmation is a line of text, not a dialog. A modal interrupts, dims the page, takes
 * focus and demands to be dismissed — a lot of ceremony to report that eight lines reached the
 * clipboard, and it lands in front of the reader at the moment they are trying to leave for
 * another tab.
 */
export function ShareRow({
  handle,
  text,
}: {
  handle: string;
  /** The whole post, links included, composed on the server so every copy is identical. */
  text: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const share = async () => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Insecure origin, denied permission, no clipboard API. Announcing success here would be
      // the worst failure available: the person switches app, pastes, and gets whatever was on
      // the clipboard before.
      ok = false;
    }
    track("share", { surface: "copy", handle, ok });
    setState(ok ? "copied" : "failed");

    if (timer.current) clearTimeout(timer.current);
    // The failure stays put: it carries the only copy of the text, and clearing it would take
    // away the way through. Success fades, having nothing left to say.
    if (ok) timer.current = setTimeout(() => setState("idle"), 4000);
  };

  return (
    <div className={styles.row}>
      <div className={styles.line}>
        <button className={styles.share} type="button" onClick={share}>
          share on your socials
        </button>

        {/* Announced politely rather than assertively: it is a confirmation, not an alert, and
            it must not interrupt whatever a screen reader is in the middle of. */}
        <span className={styles.status} role="status" aria-live="polite">
          {state === "copied" && "copied — paste it on your socials"}
          {state === "failed" && "your browser blocked the copy — take it from below"}
        </span>
      </div>

      {/* Only on failure, and inline rather than over the page. The happy path needs no escape
          hatch; this one has no other way through. */}
      {state === "failed" && (
        <textarea className={styles.fallback} readOnly value={text} rows={6} />
      )}
    </div>
  );
}
