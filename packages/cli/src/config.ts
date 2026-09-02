import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { AgentId, Layout, Theme } from "@tokenstats/core";

export const CONFIG_FILE = ".tokenstats.json";

export type Config = {
  /** GitHub handle shown on the card. */
  handle: string;
  /** Which agents to read. Empty means every adapter that reports data. */
  agents: AgentId[];
  /** Where `sync` writes the SVG, relative to the repo root. */
  output: string;
  layout: Layout;
  theme: Theme;
};

export const DEFAULT_CONFIG: Config = {
  handle: "",
  agents: [],
  output: "tokenstats.svg",
  layout: "default",
  theme: "auto",
};

export const configPath = (cwd = process.cwd()): string => resolve(cwd, CONFIG_FILE);

export async function readConfig(cwd = process.cwd()): Promise<Config | null> {
  try {
    const raw = await readFile(configPath(cwd), "utf8");
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<Config>) };
  } catch {
    return null;
  }
}

/**
 * Written with a trailing newline and two-space indent so it reads as a hand-editable file
 * rather than a generated one — it is meant to be committed, reviewed and tweaked, and it
 * deliberately holds nothing but display preferences. No paths, no tokens, no identifiers
 * beyond the handle the user chose to publish.
 */
export async function writeConfig(config: Config, cwd = process.cwd()): Promise<string> {
  const path = configPath(cwd);
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return path;
}
