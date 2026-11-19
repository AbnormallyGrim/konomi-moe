import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

// The extension's pages: the full app in its own tab and the toolbar popup. No inline scripts
// (extension pages forbid them), relative paths, and no module-preload polyfill.
export default defineConfig({
  plugins: [preact()],
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist/.pages",
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    rollupOptions: { input: { app: "app.html", popup: "popup.html" } },
  },
  test: { environment: "node" },
});
