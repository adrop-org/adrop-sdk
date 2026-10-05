import { defineConfig } from "tsup";
export default defineConfig([
  { entry: ["src/index.ts"], format: ["esm"], dts: true, sourcemap: true, clean: true, external: ["@solana/web3.js"] },
  { entry: { "adrop.iife": "src/index.ts" }, format: ["iife"], globalName: "Adrop", minify: true, noExternal: ["@solana/web3.js"], platform: "browser" },
]);
