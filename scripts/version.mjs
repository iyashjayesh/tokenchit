#!/usr/bin/env node
/**
 * Set both package versions, and the dependency between them, in one step.
 *
 *   node scripts/version.mjs 0.2.0
 *
 * The CLI depends on an exact core version, so bumping them separately is how you publish a
 * CLI that resolves a core which does not exist yet. Doing both here means they cannot
 * disagree, and the release workflow refuses to publish when the tag does not match.
 */
import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("usage: node scripts/version.mjs <major.minor.patch>");
  process.exit(1);
}

for (const file of ["packages/core/package.json", "packages/cli/package.json"]) {
  const pkg = JSON.parse(await readFile(file, "utf8"));
  pkg.version = version;
  if (pkg.dependencies?.["@tokenstats/core"]) {
    pkg.dependencies["@tokenstats/core"] = version;
  }
  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`${pkg.name} -> ${version}`);
}

console.log(`\nnext:\n  npm install\n  git commit -am "Release v${version}"\n  git tag v${version}\n  git push --follow-tags`);
