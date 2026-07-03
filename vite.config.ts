import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import UnoCSS from "unocss/vite";

export default defineConfig({
  plugins: [UnoCSS(), solid()],
  server: {
    port: 5552,
    proxy: {
      "/ws": {
        target: "http://localhost:5551",
        ws: true,
      },
    },
  },
});
