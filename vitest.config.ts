import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    setupFiles: ["./test/env.ts"],
    include: ["test/**/*.test.ts"],
    fileParallelism: false, // ერთი test DB — თანმიმდევრობით
    hookTimeout: 30000,
    testTimeout: 20000,
  },
});
