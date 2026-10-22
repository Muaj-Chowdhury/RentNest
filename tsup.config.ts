import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "esnext",
  platform: "node",
  outDir: "dist",
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  // Some CJS dependencies (e.g. pg) call require() at runtime; the banner
  // provides a require() shim for the bundled ESM output.
  banner: {
    js: `
      import { createRequire } from 'module';
      const require = createRequire(import.meta.url);
    `,
  },
});
