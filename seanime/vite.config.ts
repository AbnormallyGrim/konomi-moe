import preact from "@preact/preset-vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig } from "vitest/config";

// The page as one HTML string: Seanime sets it as the frame's content.
export default defineConfig({
  plugins: [preact(), viteSingleFile()],
  build: { target: "es2022", outDir: "dist/page", emptyOutDir: true },
  test: { environment: "node" },
});
