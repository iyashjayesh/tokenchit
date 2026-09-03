/**
 * Isomorphic entry point: the card builder, the price table and the aggregation, none of
 * which touch the filesystem.
 *
 * The adapters live behind `@tokenchit/core/adapters` precisely because they import
 * `node:fs` and `node:sqlite`. Re-exporting them here would drag Node built-ins into the
 * site's client bundle the moment a component imports `buildCardSvg`, which is exactly what
 * happened the first time this was one barrel.
 */
export * from "./card-svg.js";
export * from "./types.js";
export * from "./aggregate.js";
export * from "./recap.js";
export * from "./recap-svg.js";
export * from "./pricing.js";
export * from "./format.js";
export * from "./publish.js";
export * from "./validate.js";
