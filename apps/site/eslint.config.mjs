import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  {
    /*
     * Avatars are plain <img>, deliberately.
     *
     * The rule's case is that next/image optimises and lazy-loads for you. Here it would
     * re-optimise a 24-40px avatar that /api/avatar has already fetched from GitHub, asked for
     * at s=48, and cached for a week — a second optimisation pass over an image that is
     * already the right size, plus the client JS next/image ships to do it.
     *
     * Every one of these carries explicit width and height, so the layout-shift half of the
     * warning does not apply either. Scoped to the files that render an avatar rather than
     * disabled globally, so a stray <img> somewhere else still gets caught.
     */
    files: [
      "app/board/page.tsx",
      /* Wildcard, not the literal path: the directory is named `[handle]` and a glob reads
         square brackets as a character class, so the literal never matches the file. */
      "app/u/**/page.tsx",
      "components/leaderboard.tsx",
      "components/leaderboard-modal.tsx",
      "components/podium.tsx",
    ],
    rules: { "@next/next/no-img-element": "off" },
  },

  {
    /*
     * The share sheet and the arrival panel use a plain <img> for a different reason than the
     * avatars do.
     *
     * It shows `/u/<handle>/opengraph-image`, and the two controls beside it — download, and
     * copy-to-clipboard — have to act on that exact URL. Routing the preview through
     * next/image would show the reader an optimised derivative while handing them the original,
     * so the picture they approve and the file they post would be produced by different
     * pipelines. It is also already a PNG at precisely the size it is displayed at, so there is
     * nothing for a second optimisation pass to do but bill for it.
     */
    files: ["components/share-row.tsx", "components/published-modal.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
]);

export default eslintConfig;
