/**
 * Serves seanime/dist on http://localhost:8765 for Seanime's Install from URL. Unlike
 * `python3 -m http.server`, it sends CORS headers: Seanime loads the extension icon with
 * crossOrigin="anonymous", so without them the icon fails and Seanime shows a placeholder.
 * Run with `npm run serve -w seanime` after `npm run build -w seanime`.
 */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const PORT = Number(process.env.PORT ?? 8765);
const TYPES: Record<string, string> = {
  ".json": "application/json",
  ".png": "image/png",
  ".html": "text/html; charset=utf-8",
};

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
  const file = join(dist, path);
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
    console.log(`200 ${req.method} ${path}`);
  } catch {
    res.writeHead(404).end();
    console.log(`404 ${req.method} ${path}`);
  }
}).listen(PORT, "127.0.0.1", () => console.log(`serving ${dist} on http://localhost:${PORT}`));
