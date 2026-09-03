#!/usr/bin/env node
/**
 * Set both package versions, and the dependency between them, in one step.
 *
 *   node scripts/version.mjs 0.2.0
 *
 * Only @tokenchit/cli is published; core is private and bundled into it. Both are bumped
 * anyway so the repo does not carry two versions that quietly diverge, and the release
 * workflow refuses to publish when the tag disagrees with the CLI.
 */
import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("usage: node scripts/version.mjs <major.minor.patch>");
  process.exit(1);
}

// apps/site depends on the private core package with "*" precisely so it never needs
// bumping here; pinning it is what broke `npm ci` on the first release.
for (const file of ["packages/core/package.json", "packages/cli/package.json"]) {
  const pkg = JSON.parse(await readFile(file, "utf8"));
  pkg.version = version;
  if (pkg.dependencies?.["@tokenchit/core"]) {
    pkg.dependencies["@tokenchit/core"] = version;
  }
  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`${pkg.name} -> ${version}`);
}

// The site reads this version straight from packages/cli/package.json, so nothing here
// writes to apps/site. Nothing here tags either: the release workflow watches main and
// publishes whenever this field names a version npm does not have, so the bump is the
// release. Merging anything that leaves this field alone publishes nothing.
console.log(
  `\nnext:\n  npm install\n  git commit -am "Release v${version}"\n  git push` +
    `\n\nCI tags v${version} and publishes once the checks pass.` +
    `\nThe site badge follows from the same push.`,
);
