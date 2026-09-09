"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { track } from "@/components/analytics";
import styles from "./share-row.module.css";

type Flash = "idle" | "done" | "failed";

/**
 * A copy button that says whether it worked, and stops saying it after a while.
 *
 * The success message fades, having nothing left to add. A failure stays put: on the text and
 * the link it is the reader's cue to use the field below instead, and clearing it would take
 * away the way through.
 */
function useFlash(): [Flash, (ok: boolean) => void] {
  const [state, setState] = useState<Flash>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return [
    state,
    (ok: boolean) => {
      setState(ok ? "done" : "failed");
      if (timer.current) clearTimeout(timer.current);
      if (ok) timer.current = setTimeout(() => setState("idle"), 4000);
    },
  ];
}

/**
 * The share sheet: the image, the post, and both ways to get them out of here.
 *
 * This used to be one button that copied eight lines of text, on the reasoning that the
 * clipboard is the one interface every platform accepts. That reasoning still holds for the
 * text — X takes prefilled text through its intent endpoint; LinkedIn takes a URL and nothing
 * else, because the parameters that carried text were removed and the API that composes a post
 * needs a member OAuth token a site with no browser session cannot hold; Instagram has no web
 * post intent at all. A row of platform buttons would work as advertised on one of them.
 *
 * What it missed is that the text alone does not carry the picture. A pasted post is a link
 * and the platform decides what to unfurl from it: whether to wait for a 1200x630 PNG that has
 * to be rendered on demand, whether to show an image at all, and — while the post still
 * carried two links — which of them to read. The answer to "why did my post show the generic
 * tokenchit card" is that every one of those decisions belonged to somebody else.
 *
 * Attaching the image removes the whole negotiation. LinkedIn and X both rank a native image
 * above a link preview, so this is also the version that travels further.
 *
 * A disclosure rather than a modal: it opens under the button, takes no focus it was not
 * given, and dismisses by being ignored. It also means the 1200x630 PNG is requested when
 * somebody asks to share and not on every profile view.
 */
export function ShareRow({
  handle,
  text,
  imagePath,
  imageUrl,
}: {
  handle: string;
  /** The whole post, links included, composed on the server so every copy is identical. */
  text: string;
  /** Same-origin path, for the preview and the clipboard — works on localhost too. */
  imagePath: string;
  /** The absolute form, which is the only one worth pasting somewhere else. */
  imageUrl: string;
}) {
  const [open, setOpen] = useState(false);
  /*
   * Whether the panel has ever been opened, which is not the same as whether it is open now.
   *
   * `hidden` does not stop an <img> from loading — neither does `display: none`, and neither
   * does `loading="lazy"` reliably — so a preview sitting inside the collapsed panel was
   * fetched on every profile view by every visitor, which is the on-demand 1200x630 render
   * this change exists to stop paying for. Rendering the tag only after the first open is the
   * version where a reader who never shares never asks for the image at all.
   *
   * Latched rather than tracking `open`, so closing and reopening does not discard a picture
   * the browser already holds.
   */
  const [everOpened, setEverOpened] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);

  const [textFlash, flashText] = useFlash();
  const [imageFlash, flashImage] = useFlash();
  const [linkFlash, flashLink] = useFlash();

  const panelId = useId();

  /*
   * Writing an image to the clipboard needs `ClipboardItem`, which Firefox does not ship
   * enabled. Offering a button that cannot work is worse than not offering it, since download
   * does the same job everywhere.
   *
   * `useSyncExternalStore` rather than an effect: the answer differs between the server, which
   * has no navigator, and the client, and this is the hook whose whole job is that difference.
   * A lazy `useState` initialiser would render `false` on the server and `true` on the client
   * and mismatch on hydration; an effect would be a setState in an effect. The subscribe
   * function is a no-op because browser support does not change while the page is open.
   */
  const canCopyImage = useSyncExternalStore(
    () => () => {},
    () => typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write,
    () => false,
  );

  const writeText = async (value: string, flash: (ok: boolean) => void, surface: string) => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Insecure origin, denied permission, no clipboard API. Announcing success here would be
      // the worst failure available: the person switches app, pastes, and gets whatever was on
      // the clipboard before.
      ok = false;
    }
    track("share", { surface, handle, ok });
    flash(ok);
  };

  const copyImage = async () => {
    let ok = true;
    try {
      /* The fetch is handed to ClipboardItem unresolved on purpose. Safari only honours a
         clipboard write that is issued synchronously inside the gesture that asked for it, so
         awaiting the blob first and writing after loses the permission. Chrome accepts the
         same form. */
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
    track("share", { surface: "image-copy", handle, ok });
    flashImage(ok);
  };

  return (
    <div className={styles.row}>
      <button
        className={styles.share}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            setEverOpened(true);
            track("share", { surface: "open", handle });
          }
        }}
      >
        share on your socials
        <span className={styles.caret} aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>

      <div className={styles.panel} id={panelId} hidden={!open}>
        {/* ── The image ────────────────────────────────────────────────────── */}
        <p className={styles.label}>the image</p>

        {imageBroken && (
          <p className={styles.note}>
            The card image could not be rendered just now. The post below still works — the
            platform will build its own preview from the profile link.
          </p>
        )}

        {everOpened && !imageBroken && (
          <img
            className={styles.preview}
            src={imagePath}
            width={1200}
            height={630}
            alt={`The card for @${handle}: tokens, equivalent cost and streak`}
            decoding="async"
            onError={() => setImageBroken(true)}
          />
        )}

        <div className={styles.actions}>
          {/* A plain link, so the browser saves it rather than JavaScript reconstructing a
              download it already knows how to do. Same-origin, which is what makes `download`
              honour the filename instead of navigating. */}
          <a
            className={styles.action}
            href={imagePath}
            download={`tokenchit-${handle}.png`}
            onClick={() => track("share", { surface: "image-download", handle, ok: true })}
          >
            download png
          </a>

          {canCopyImage && (
            <button className={styles.action} type="button" onClick={copyImage}>
              copy image
            </button>
          )}

          <button
            className={styles.action}
            type="button"
            onClick={() => void writeText(imageUrl, flashLink, "image-link")}
          >
            copy image link
          </button>

          <span className={styles.status} role="status" aria-live="polite">
            {imageFlash === "done" && "image copied — paste it into the post"}
            {imageFlash === "failed" && "your browser blocked that — use download png"}
            {linkFlash === "done" && "link copied"}
            {linkFlash === "failed" && "your browser blocked that — the link is below"}
          </span>
        </div>

        <input className={styles.url} readOnly value={imageUrl} aria-label="Image link" />

        {/* ── The post ─────────────────────────────────────────────────────── */}
        <p className={styles.label}>the post</p>

        {/* Always present, not only after a failed copy. It is the thing being offered, and a
            reader who can see the text before copying it can also edit it after pasting. */}
        {/* Ten, not eight: the post is eight lines but the middle one wraps at this width, and a
            box that hides its own last line reads as broken rather than as scrollable. */}
        <textarea className={styles.text} readOnly value={text} rows={10} />

        <div className={styles.actions}>
          <button
            className={styles.action}
            type="button"
            onClick={() => void writeText(text, flashText, "copy")}
          >
            copy post text
          </button>
          <span className={styles.status} role="status" aria-live="polite">
            {textFlash === "done" && "copied — paste it on your socials"}
            {textFlash === "failed" && "your browser blocked the copy — take it from above"}
          </span>
        </div>

        <p className={styles.hint}>
          Attach the PNG to the post rather than relying on the link preview. LinkedIn and X
          both rank a native image above an unfurled link, and whether a preview appears at all
          is the platform&rsquo;s decision rather than yours.
        </p>
      </div>
    </div>
  );
}
