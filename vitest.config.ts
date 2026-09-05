import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.unit.test.ts"],
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
    mockReset: true,
  },
});
