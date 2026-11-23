import { defineConfig } from "vite";

export default defineConfig({
  root: "public",
  publicDir: "../public-static",
  build: {
    outDir: "../dist",
    emptyOutDir: true
  }
});
