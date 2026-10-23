import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        cesium: resolve(import.meta.dirname, "cesium/index.html"),
        three: resolve(import.meta.dirname, "three/index.html"),
      },
    },
  },
});
