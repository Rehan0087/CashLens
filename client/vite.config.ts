import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // The API binds to IPv4 127.0.0.1 by default. Using the explicit IPv4
      // address avoids Windows resolving localhost to IPv6 ::1 first.
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },
    },
  },
});
