"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_HANDLE, sanitizeHandle } from "@/lib/sample-data";

/**
 * The three pieces of state that cross section boundaries.
 *
 * `handle` drives the hero preview card, both embed snippets in section 01, and the
 * highlighted row in the board. The window filter and the copy-button timers are
 * local to their own components and deliberately not in here.
 *
 * `signedIn` is local state: signing in proves the account is real, enables the
 * hosted endpoint and opts into the public board — wire this seam to a real GitHub
 * OAuth flow when there is one. Nothing else in the app should read auth directly.
 */
type SiteState = {
  handle: string;
  setHandle: (raw: string) => void;
  signedIn: boolean;
  signIn: () => void;
  signOut: () => void;
};

const Ctx = createContext<SiteState | null>(null);

export function SiteStateProvider({ children }: { children: ReactNode }) {
  const [handle, setHandleRaw] = useState(DEFAULT_HANDLE);
  const [signedIn, setSignedIn] = useState(false);

  const setHandle = useCallback((raw: string) => {
    setHandleRaw(sanitizeHandle(raw));
  }, []);

  const value = useMemo<SiteState>(
    () => ({
      handle,
      setHandle,
      signedIn,
      signIn: () => setSignedIn(true),
      signOut: () => setSignedIn(false),
    }),
    [handle, setHandle, signedIn],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSiteState(): SiteState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSiteState must be used inside <SiteStateProvider>");
  return ctx;
}
