import { opendir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Yield every file under `root` with the given extension, depth-first.
 *
 * Hand-rolled rather than pulled from `fs.glob` because that is still experimental on
 * Node 22, and the CLI's whole pitch is that it runs on your machine without surprises.
 * Unreadable directories are skipped rather than thrown: agent log trees routinely contain
 * sockets, lock files and half-removed session directories.
 */
export async function* walkFiles(root: string, ext: string): AsyncGenerator<string> {
  let dir;
  try {
    dir = await opendir(root);
  } catch {
    return;
  }

  for await (const entry of dir) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(path, ext);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      yield path;
    }
  }
}
