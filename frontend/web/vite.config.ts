import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [] } },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/v1": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8787",
        ws: true,
      },
      "/health": process.env.VITE_API_PROXY_TARGET || "http://localhost:8787",
    },
  },
});
