#!/usr/bin/env node
/**
 * Set both package versions, and the dependency between them, in one step.
 *
 *   node scripts/version.mjs 0.2.0
 *
 * Only @tokenstats/cli is published; core is private and bundled into it. Both are bumped
 * anyway so the repo does not carry two versions that quietly diverge, and the release
 * workflow refuses to publish when the tag disagrees with the CLI.
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
