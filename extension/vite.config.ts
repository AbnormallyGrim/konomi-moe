import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

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
