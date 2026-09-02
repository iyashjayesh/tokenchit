"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./copy-button.module.css";

/**
 * Writes to the clipboard and swaps its label for 1400ms. Each instance owns its
 * timer, so the three copy buttons on the page never interfere with one another.
 */
export function CopyButton({
  value,
  variant,
  idleLabel = "copy",
  copiedLabel = "copied",
}: {
  value: string;
  variant: "ink" | "lime" | "yellow";
  idleLabel?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard can be unavailable (insecure origin, denied permission).
      // The label still confirms the intent; there is nothing useful to recover.
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button type="button" onClick={onClick} className={styles[variant]}>
      {copied ? copiedLabel : idleLabel}
    </button>
  );
}
