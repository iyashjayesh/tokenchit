import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Where the tokenchit API key lives.
 *
 * Deliberately not `.tokenchit.json` — that file is committed. Credentials belong in the
 * user's config directory, on their machine, and nowhere a `git add -A` can reach.
 */
const authPath = (): string =>
  join(
    process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"),
    "tokenchit",
    "auth.json",
  );

export type Auth = {
  /** Our own API key. The GitHub token is never stored — see commands/login.ts. */
  token: string;
  handle: string;
  api: string;
  createdAt: string;
  /**
   * The account's avatar as a `data:` URI, from the sign-in response.
   *
   * Stored so `sync` can put a face on the committed card without making a network request —
   * the guarantee that `sync` reads only local files is enforced by a test, and this is how
   * the bytes get here without breaking it. Absent for anyone who has not signed in, which is
   * the same gate the board uses: no proved handle, no face.
   */
  avatar?: string;
};

export async function readAuth(): Promise<Auth | null> {
  try {
    return JSON.parse(await readFile(authPath(), "utf8")) as Auth;
  } catch {
    return null;
  }
}

export async function writeAuth(auth: Auth): Promise<string> {
  const path = authPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
  // Written before anyone else can read it: 0600, owner only.
  await chmod(path, 0o600);
  return path;
}

export async function clearAuth(): Promise<boolean> {
  try {
    await rm(authPath());
    return true;
  } catch {
    return false;
  }
}

export const authFile = authPath;
