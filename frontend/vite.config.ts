import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 로컬 개발: /api/* 요청을 Workers 개발 서버로 프록시
      "/api": {
        target: "http://localhost:8787",
        rewrite: (path) => path.replace(/^\/api/, ""),
        changeOrigin: true,
      },
    },
  },
});
