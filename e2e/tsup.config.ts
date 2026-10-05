import { defineConfig } from "tsup";
export default defineConfig({ entry: { page: "e2e/page.ts" }, outDir: "e2e/dist", format: ["iife"], platform: "browser", noExternal: [/.*/], clean: true });
