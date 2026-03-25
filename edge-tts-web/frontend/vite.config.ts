import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 6606,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:6605",
        changeOrigin: true,
      },
      "/downloads": {
        target: "http://localhost:6605",
        changeOrigin: true,
      },
    },
  },
});
