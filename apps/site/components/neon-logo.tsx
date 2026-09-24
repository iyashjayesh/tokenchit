/**
 * The Neon logotype, inlined.
 *
 * Not hotlinked from neon.com, because the site's CSP is `img-src 'self' data:` and an
 * external image would be blocked outright — silently, since a blocked image renders as
 * nothing. The README can hotlink it only because GitHub proxies images through its own
 * domain. Inlining also matches how the GitHub mark is handled next door.
 *
 * Two paths, and they are treated differently on purpose. The mark keeps Neon's green at all
 * times: it is the trademark, and recolouring somebody's logo to suit a background is the one
 * liberty not to take with it. The wordmark is `currentColor` so it inherits the ink of
 * whatever it sits on — which is exactly what Neon's own light and dark variants do, the only
 * difference between the two files being a black wordmark and a white one.
 *
 * Geometry and the mark's #37C38F are verbatim from
 * https://neon.com/brand/neon-logo-light-color.svg — not from memory.
 */
export function NeonLogo({ height = 26 }: { height?: number }) {
  return (
    <svg
      height={height}
      viewBox="0 0 157 45"
      fill="none"
      role="img"
      aria-label="Neon"
      style={{ width: "auto" }}
    >
      <path d="M43.9855 0.0123174V44L26.9857 29.2514V44H0.417969V0L43.9855 0.0123174ZM5.75846 38.6595H21.6452V17.5326L38.6453 32.5729V5.35124L5.75846 5.34181V38.6595Z" fill="#37C38F" />
      <path d="M79.0696 35.7042L62.1559 20.7349V35.4106H56.8359V9.06775L73.7497 24.037V9.36126H79.0696V35.7042ZM84.9261 35.4106V9.36126H100.849V14.6078H90.2461V19.7443H98.6479V24.8808H90.2461V30.1641H100.849V35.4106H84.9261ZM117.319 35.7042C109.944 35.7042 104 29.7605 104 22.386C104 15.0114 109.944 9.06775 117.319 9.06775C124.693 9.06775 130.637 15.0114 130.637 22.386C130.637 29.7605 124.693 35.7042 117.319 35.7042ZM117.319 30.5677C121.868 30.5677 125.28 26.8987 125.28 22.386C125.28 17.8732 121.868 14.2042 117.319 14.2042C112.769 14.2042 109.357 17.8732 109.357 22.386C109.357 26.8987 112.769 30.5677 117.319 30.5677ZM156.492 35.7042L139.578 20.7349V35.4106H134.258V9.06775L151.172 24.037V9.36126H156.492V35.7042Z" fill="currentColor" />
    </svg>
  );
}
