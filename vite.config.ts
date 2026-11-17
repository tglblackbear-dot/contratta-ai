import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryName = "contratta-ai";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "inject-sw-build-id",
      apply: "build",
      writeBundle() {
        const swPath = resolve(process.cwd(), "dist", "sw.js");
        if (!existsSync(swPath)) return;
        const source = readFileSync(swPath, "utf8").replace("__BUILD_ID__", Date.now().toString(36));
        writeFileSync(swPath, source, "utf8");
      },
    },
  ],
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
