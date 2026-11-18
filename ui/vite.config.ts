import preact from "@preact/preset-vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig } from "vitest/config";

// One self-contained HTML file: Seanime renders the page from a string in a sandboxed frame.
export default defineConfig({
  plugins: [preact(), viteSingleFile()],
  build: { target: "es2022", outDir: "dist" },
  test: { environment: "node" },
});
