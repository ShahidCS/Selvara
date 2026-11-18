import { defineConfig } from "vitest/config";
import path from "node:path";

/* Database tests (tests/db): row level security, the approvals guard and the audit chain, run against a real throwaway Postgres named by
   TEST_DATABASE_URL (CI starts one; locally see tests/db/README in the file header of isolation.test.ts). They reset the database they are given. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["tests/db/**/*.test.ts"], fileParallelism: false, testTimeout: 20_000, hookTimeout: 60_000 },
});
