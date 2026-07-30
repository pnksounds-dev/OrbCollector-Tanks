import { defineConfig } from "vite";

export default defineConfig({
  // Serve the existing assets/ folder at the root so all media paths
  // resolve as /items/..., /Audio/..., etc. without moving files.
  publicDir: "assets",
  server: {
    port: 3000,
  },
  build: {
    target: "es2020",
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});
