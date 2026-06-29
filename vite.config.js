import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true, // expose on the local network so you can test on a phone
    port: 5173,
  },
});
