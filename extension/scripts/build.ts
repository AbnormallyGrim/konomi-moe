/**
 * Builds the extension for Chromium browsers (dist/chrome) and Firefox (dist/firefox), plus a
 * zip of each for the stores when `zip` is installed. Run with `npm run build -w extension`;
 * load dist/chrome as an unpacked extension (chrome://extensions, Developer mode) or
 * dist/firefox/manifest.json as a temporary add-on (about:debugging).
 *
 * AniList sign-in needs an AniList API client (anilist.co/settings/developer) whose redirect URL
 * is AniList's code page, https://anilist.co/api/v2/oauth/pin (see src/auth.ts). One client
 * serves every browser. Its ID is public (it's in the sign-in link), so it can live here once
 * registered; ANILIST_CLIENT_ID overrides it.
 * EXTENSION_KEY overrides the Chromium manifest key (the dev key below fixes the unpacked ID);
 * set it to "none" for a store upload, where the store assigns the ID.
 */

import { execFileSync } from "node:child_process";
import { copyFile, cp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { build as vite } from "vite";
import { manifest, type Target } from "../src/manifest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };

/** The AniList API client's ID; empty until one is registered. */
const ANILIST_CLIENT_ID = "57513";

/**
 * Public half of the development key: unpacked copies always get the ID
 * blkfmdjmlkilgkcaadhjicokkcpffbon, so their storage survives reinstalling.
 */
const DEV_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtfRoyqq7NdmjMg0Y8Tyc/tRyVDASmtruOcH+U5nG/K8J0ZtFTzRCTG0z8QnqMOWgIUch69veff3oPDP1uYFyVdV0fTfb39//Pm6y4X8l4R6zfMFzthVWT9FCCb58RY2l0bNrHPKPMlCzZuD8Ro2tvqXOsaBB7SdIMDmlTP7hg+GlJY7MlD/QFauoWyxICS9iBCDoID7dg2PedbgJ7vCbH9Yj6jxsqfisGFiYtAPr47Px4raTvhsWSJnrQrK6gW9lAX/R/uB3JpXO9hZhZbHLvL1mqwpTTyWpDPMz62U3G3stwXtk3xPBt+zAtot11d8tfcH2GinU+4FEnNU3lmLMCwIDAQAB";

const key =
  process.env.EXTENSION_KEY === "none" ? undefined : (process.env.EXTENSION_KEY ?? DEV_KEY);
const clientId = process.env.ANILIST_CLIENT_ID ?? ANILIST_CLIENT_ID;
const define = { __ANILIST_CLIENT_ID__: JSON.stringify(clientId) };

// Pages (app tab, popup) with Vite; the background and the content script as single files.
const staging = join(root, "dist/.pages");
await vite({ root, configFile: join(root, "vite.config.ts"), logLevel: "warn", define });
for (const entry of ["background", "content"]) {
  await esbuild({
    entryPoints: [join(root, `src/${entry}.ts`)],
    outfile: join(staging, `${entry}.js`),
    bundle: true,
    format: "iife",
    target: "es2022",
    platform: "browser",
    define,
    legalComments: "none",
    logLevel: "warning",
  });
}

const zipAvailable = (() => {
  try {
    execFileSync("zip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

for (const target of ["chrome", "firefox"] as Target[]) {
  const out = join(root, "dist", target);
  await rm(out, { recursive: true, force: true });
  await cp(staging, out, { recursive: true });
  for (const size of [16, 32, 48, 128])
    await copyFile(join(root, `assets/icon-${size}.png`), join(out, `icon-${size}.png`));
  const m = manifest(target, pkg.version, target === "chrome" && key ? { key } : {});
  await writeFile(join(out, "manifest.json"), `${JSON.stringify(m, null, 2)}\n`);
  if (zipAvailable) {
    const zip = join(root, "dist", `konomi-moe-${target}-${pkg.version}.zip`);
    await rm(zip, { force: true });
    execFileSync("zip", ["-qr", zip, "."], { cwd: out });
  }
  console.log(`wrote extension/dist/${target}`);
}
await rm(staging, { recursive: true, force: true });
if (!clientId)
  console.log("no ANILIST_CLIENT_ID: sign-in will say it isn't set up (see scripts/build.ts)");
