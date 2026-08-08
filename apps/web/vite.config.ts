import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El dev server proxea /api al backend para que el navegador nunca vea
// otro origen: mismas cookies, mismo CORS que en produccion.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    // El look pixel art no tolera recompresion con perdida en los sprites
    assetsInlineLimit: 4096,
  },
});
