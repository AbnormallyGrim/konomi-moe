/**
 * Builds the Seanime plugin manifest: the page as one HTML string, inlined into the plugin
 * script (ES2018, which is what Seanime compiles plugins to), written as dist/<id>.json.
 * Run with `npm run build -w seanime` (Node 23.6+ runs this TypeScript directly).
 *
 * `--release` (`npm run release -w seanime`) points the manifest at its published address and
 * also writes it to release/<id>.json, with the code in release/<id>-<version>.js (payloadURI). Committing that file to main publishes it: Seanime users
 * install from the raw GitHub link, and Seanime's update check fetches the same link.
 */

import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { build as vite } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };

/** Internal ID; Seanime keys the plugin's storage by it, so changing it loses saved data. */
export const ID = "konomi-moe";
const NAME = "Konomi.moe";
/**
 * The oldest Seanime this plugin runs on. Seanime (2.8.2+) refuses to load the plugin on an
 * older version and says why, instead of failing obscurely. 3.10.4 added plugin dialogs, which
 * the AniList button needs (everything else exists since 3.3.0; see scripts/check-api.ts).
 */
export const MIN_SEANIME = "3.10.4";
const RELEASE = process.argv.includes("--release");
/**
 * The published manifest's address. Users paste it into Seanime's Install from URL, and every
 * installed copy checks it for updates, so it must never move. Needs the repo to be public.
 */
export const RELEASE_URI = `https://raw.githubusercontent.com/AbnormallyGrim/konomi-moe/refs/heads/main/seanime/release/${ID}.json`;
/**
 * Where Seanime downloads the manifest from. Its install button uses this field, not the URL
 * typed in, and its update check fetches it later. A normal build points at a local file server
 * (`npm run serve -w seanime`) for testing; MANIFEST_URI overrides it.
 */
const MANIFEST_URI = RELEASE
  ? RELEASE_URI
  : (process.env.MANIFEST_URI ?? `http://localhost:8765/${ID}.json`);
/**
 * The thumbnail on Seanime's extension list: a PNG published next to the manifest. Seanime
 * shows only icon URLs ending in .png/.jpg/.webp (so no data URI), and loads them with
 * crossOrigin="anonymous", so the server must send CORS headers (raw.githubusercontent.com
 * does; for local testing use `npm run serve -w seanime`, not python's http.server).
 * assets/icon.png is the full-size transparent original; Seanime shows 48px, so 128px is plenty.
 */
const ICON_FILE = `${ID}.png`;
const ICON = new URL(ICON_FILE, MANIFEST_URI).href;

await vite({ root, configFile: join(root, "vite.config.ts"), logLevel: "warn" });
const html = await readFile(join(root, "dist/page/index.html"), "utf8");
if (!html.includes("<head>")) throw new Error("the page needs a <head> for Seanime's bridge");

const bundle = await esbuild({
  entryPoints: [join(root, "src/plugin.ts")],
  bundle: true,
  format: "iife",
  globalName: "__forYou",
  target: "es2018",
  platform: "neutral",
  define: { __PAGE_HTML__: JSON.stringify(html) },
  legalComments: "none",
  write: false,
});
// Seanime calls the global init(); $ui.register then receives its callback as source text and
// runs it in a fresh runtime. So the whole bundle goes inside the callback, and nothing else
// may sit outside init(). No "use strict" either: the callback is a function body.
const code = (bundle.outputFiles[0]?.text ?? "").replace(/^"use strict";\n/, "");
const payload = `function init() {\n  $ui.register((ctx) => {\n${code}\n    __forYou.start(ctx);\n  });\n}\n`;

const manifest = {
  id: ID,
  name: NAME,
  version: pkg.version,
  semverConstraint: `>=${MIN_SEANIME}`,
  manifestURI: MANIFEST_URI,
  language: "javascript",
  type: "plugin",
  description: "Recommendations learned from your own AniList: a For you page in the side menu.",
  author: "AbnormallyGrim", // required by Seanime (at most 25 characters)
  icon: ICON,
  website: "https://github.com/AbnormallyGrim/konomi-moe",
  lang: "en",
  payload,
  plugin: { version: "1", permissions: { scopes: ["storage", "anilist"] } },
};
await mkdir(join(root, "dist"), { recursive: true });
const out = join(root, "dist", `${ID}.json`);
await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);
await copyFile(join(root, "assets/icon-128.png"), join(root, "dist", ICON_FILE));
if (RELEASE) {
  // The release keeps the code in its own file (payloadURI) so it can be read and diffed.
  // Seanime downloads it once at install and stores it inline, and skips it on update checks.
  // The file name carries the version: raw.githubusercontent.com caches each file for a few
  // minutes, so a fixed name could pair a new manifest with old code right after a release.
  const dir = join(root, "release");
  const payloadFile = `${ID}-${pkg.version}.js`;
  const { payload: _inline, ...rest } = manifest;
  const released = { ...rest, payloadURI: new URL(payloadFile, MANIFEST_URI).href };
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, payloadFile), payload);
  await writeFile(join(dir, `${ID}.json`), `${JSON.stringify(released, null, 2)}\n`);
  await copyFile(join(root, "assets/icon-128.png"), join(dir, ICON_FILE));
  // Keep the previous version's code too, for anyone whose cached manifest still points at it.
  const old = (await readdir(dir))
    .filter((f) => f.startsWith(`${ID}-`) && f.endsWith(".js") && f !== payloadFile)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .slice(1);
  for (const f of old) await rm(join(dir, f));
  console.log(
    `release: seanime/release/${ID}.json + ${payloadFile} (version ${pkg.version}); commit both to main`,
  );
}
console.log(
  `wrote ${out} (${Math.round(payload.length / 1024)} KB payload, page ${Math.round(html.length / 1024)} KB)`,
);
