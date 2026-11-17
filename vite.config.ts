import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const repositoryName = "contratta-ai";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS === "true" ? `/${repositoryName}/` : "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const modulePath = id.replace(/\\/g, "/");
          if (modulePath.includes("/node_modules/@supabase/")) return "supabase";
          if (modulePath.includes("/node_modules/@tanstack/")) return "query";
          if (
            /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(modulePath)
          ) return "framework";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
