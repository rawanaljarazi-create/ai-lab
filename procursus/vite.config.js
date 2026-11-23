import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/procursus-apt": {
        target: "https://apt.procurs.us",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/procursus-apt/, ""),
      },
    },
  },
});
