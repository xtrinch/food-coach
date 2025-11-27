import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const baseEnv = process.env.VITE_BASE_PATH ?? "/food-coach/";
const base = baseEnv.endsWith("/") ? baseEnv : `${baseEnv}/`;

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "robots.txt", "apple-touch-icon.png"],
      manifest: {
        name: "Food Coach",
        short_name: "FoodCoach",
        start_url: base,
        display: "standalone",
        background_color: "#020617",
        theme_color: "#0f172a",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ]
});
