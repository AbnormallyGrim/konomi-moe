/**
 * Checks that every Seanime plugin API this plugin calls exists in a given Seanime release, by
 * reading that release's plugin typings from a clone of Seanime's repo.
 *
 *   node scripts/check-api.ts <path to seanime clone> [tag, default v3.10.4]
 *
 * Run it before using a new Seanime API, and when raising or lowering the minimum version
 * (MIN_SEANIME in scripts/build.ts). Required APIs must exist in the minimum version; optional
 * ones must be feature-checked in src/plugin.ts, because calling a missing API while the
 * plugin starts makes Seanime unload the whole plugin.
 */

import { execFileSync } from "node:child_process";

/** What src/plugin.ts calls, as it appears in Seanime's plugin.d.ts. */
export const REQUIRED = [
  "newWebview(options",
  "sidebar?:",
  "setContent(fn",
  "channel: WebviewChannel",
  "navigateTo(path",
  "function getRawAnimeCollection",
  "function getRawMangaCollection",
  "function addMediaToCollection",
  "function refreshAnimeCollection",
  "function refreshMangaCollection",
  "declare namespace $storage",
  "newModal(options",
];
/**
 * Used only after a `typeof` check, with a fallback: the background first sync needs the
 * context's fetch and timer; without them the page syncs when it's opened.
 */
export const OPTIONAL: string[] = ["fetch(url: string", "setTimeout(fn: () => void"];

const [clone, tag = "v3.10.4"] = process.argv.slice(2);
if (!clone) {
  console.error("usage: node scripts/check-api.ts <seanime clone> [tag]");
  process.exit(2);
}
const typings = execFileSync(
  "git",
  ["-C", clone, "show", `${tag}:internal/extension_repo/goja_plugin_types/plugin.d.ts`],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
let missing = 0;
for (const api of REQUIRED) {
  const ok = typings.includes(api);
  if (!ok) missing++;
  console.log(`${ok ? "  ok     " : "  MISSING"} ${api}`);
}
for (const api of OPTIONAL)
  console.log(
    `${typings.includes(api) ? "  ok     " : "  absent "} ${api} (optional, feature-checked)`,
  );
if (missing) {
  console.error(`${missing} required API(s) missing in Seanime ${tag}`);
  process.exit(1);
}
console.log(`Every required API exists in Seanime ${tag}.`);
