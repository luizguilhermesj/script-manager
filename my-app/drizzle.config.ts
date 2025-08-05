import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/server/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: "./sqlite.db"
  },
  out: "./drizzle"
});
