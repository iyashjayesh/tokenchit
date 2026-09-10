"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { track } from "@/components/analytics";
import styles from "./published-modal.module.css";

type Flash = "idle" | "done" | "failed";

/**
 * The moment the CLI hands over.
 *
 * `tokenchit publish` spends a page of terminal output on a thing whose entire point is being
 * looked at and shared, and used to end by printing a URL into scrollback. It now opens this
 * page with `?published=1`, and this is what that parameter is for: the card as an image, the
 * three ways to get it out, and the one line that puts somebody else on the board.
 *
 * Rendered only when the server saw the parameter, so an ordinary visit to a profile does not
 * pay for the 1200x630 PNG below — the same reason the share sheet does not render its preview
 * until it is opened.
 *
 * The parameter is stripped on mount, before anything else. A URL is copied out of the address
 * bar and sent to people, and a stranger arriving on a link that congratulates them for
 * publishing is both confusing and a small lie about who did what. Stripping it also means a
 * refresh does not replay the celebration.
 */
export function PublishedModal({
  handle,
  headline,
  imagePath,
  imageUrl,
  shareText,
  command,
}: {
  handle: string;
  /** e.g. "rank 5 of 34 · 13.5B tokens · 31-day streak", or null for a held row. */
  headline: string | null;
  imagePath: string;
  imageUrl: string;
  shareText: string;
  command: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [imageBroken, setImageBroken] = useState(false);

  /* Same reasoning as the share sheet: `ClipboardItem` is what writing an image needs and
     Firefox does not ship it enabled, and this is the hook whose job is a value that differs
     between the server and the client. */
  const canCopyImage = useSyncExternalStore(
    () => () => {},
    () => typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write,
    () => false,
  );

  useEffect(() => {
    /* Before the dialog, deliberately. If anything below throws, the URL is still clean. */
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("published")) {
        url.searchParams.delete("published");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      /* A URL this browser cannot parse is not worth failing the celebration over. */
    }

    dialogRef.current?.showModal();
    /* The panel, not the close button. showModal() focuses the first control otherwise, and a
       screen reader would announce "close" before it announced what this is. Same as the
       leaderboard modal. */
    panelRef.current?.focus();
    track("published", { handle });
  }, [handle]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="published-title"
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className={styles.panel} ref={panelRef} tabIndex={-1}>
        <button
          type="button"
          className={styles.close}
          onClick={() => dialogRef.current?.close()}
          aria-label="Close"
        >
          ✕
        </button>

        <p className={styles.eyebrow}>you&rsquo;re on the board</p>
        <h2 className={styles.title} id="published-title">
          @{handle}
        </h2>
        {headline && <p className={styles.headline}>{headline}</p>}

        {imageBroken ? (
          <p className={styles.note}>
            The card image could not be rendered just now — everything below still works.
          </p>
        ) : (
          <img
            className={styles.preview}
            src={imagePath}
            width={1200}
            height={630}
            alt={`The card for @${handle}`}
            decoding="async"
            onError={() => setImageBroken(true)}
          />
        )}

        <Actions
          handle={handle}
          imagePath={imagePath}
          imageUrl={imageUrl}
          shareText={shareText}
          canCopyImage={canCopyImage}
        />

        <div className={styles.invite}>
          <p className={styles.inviteLabel}>put someone else on it</p>
          <div className={styles.inviteRow}>
            <code className={styles.command}>{command}</code>
            <CopyButton
              value={command}
              label="copy"
              surface="invite-command"
              handle={handle}
            />
          </div>
        </div>

        <div className={styles.foot}>
          <Link href="/board" className={styles.boardLink} onClick={() => dialogRef.current?.close()}>
            see the full board →
          </Link>
          <button type="button" className={styles.dismiss} onClick={() => dialogRef.current?.close()}>
            not now
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** The three ways to get the card out of here, plus the post text. */
function Actions({
  handle,
  imagePath,
  imageUrl,
  shareText,
  canCopyImage,
}: {
  handle: string;
  imagePath: string;
  imageUrl: string;
  shareText: string;
  canCopyImage: boolean;
}) {
  const [flash, setFlash] = useState<{ state: Flash; message: string }>({
    state: "idle",
    message: "",
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const report = (ok: boolean, done: string, failed: string) => {
    setFlash({ state: ok ? "done" : "failed", message: ok ? done : failed });
    if (timer.current) clearTimeout(timer.current);
    // Success fades; a failure stays, because it is the reader's cue to use another button.
    if (ok) timer.current = setTimeout(() => setFlash({ state: "idle", message: "" }), 4000);
  };

  const copyImage = async () => {
    let ok = true;
    try {
      /* Handed to ClipboardItem unresolved: Safari only honours a write issued synchronously
         inside the gesture that asked for it. */
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": fetch(imagePath).then((res) => {
            if (!res.ok) throw new Error(String(res.status));
            return res.blob();
          }),
        }),
      ]);
    } catch {
      ok = false;
    }
    track("share", { surface: "published-image-copy", handle, ok });
    report(ok, "image copied — paste it into the post", "your browser blocked that — use download");
  };

  return (
    <>
      <div className={styles.actions}>
        <a
          className={styles.action}
          href={imagePath}
          download={`tokenchit-${handle}.png`}
          onClick={() => track("share", { surface: "published-image-download", handle, ok: true })}
        >
          download png
        </a>

        {canCopyImage && (
          <button type="button" className={styles.action} onClick={copyImage}>
            copy image
          </button>
        )}

        <CopyButton value={shareText} label="copy post" surface="published-copy" handle={handle} onResult={report} />
        <CopyButton value={imageUrl} label="copy link" surface="published-link" handle={handle} onResult={report} />
      </div>

      <p className={styles.status} role="status" aria-live="polite">
        {flash.state !== "idle" && flash.message}
      </p>
    </>
  );
}

/** One clipboard button. Reports through the caller so the panel has a single status line. */
function CopyButton({
  value,
  label,
  surface,
  handle,
  onResult,
}: {
  value: string;
  label: string;
  surface: string;
  handle: string;
  onResult?: (ok: boolean, done: string, failed: string) => void;
}) {
  const [local, setLocal] = useState<Flash>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      type="button"
      className={styles.action}
      onClick={async () => {
        let ok = true;
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          // Saying "copied" here is the worst available failure: the reader switches app,
          // pastes, and gets whatever was on the clipboard before.
          ok = false;
        }
        track("share", { surface, handle, ok });
        onResult?.(ok, `${label} — done`, "your browser blocked that");
        if (!onResult) {
          setLocal(ok ? "done" : "failed");
          if (timer.current) clearTimeout(timer.current);
          if (ok) timer.current = setTimeout(() => setLocal("idle"), 3000);
        }
      }}
    >
      {local === "done" ? "copied" : local === "failed" ? "blocked" : label}
    </button>
  );
}
