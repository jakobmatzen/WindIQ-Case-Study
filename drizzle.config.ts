import { defineConfig } from "drizzle-kit";

// drizzle-kit reads DATABASE_URL:
// - locally: from .env.local (loaded by bun automatically)
// - in CI: from the GitHub environment secret (session pooler URL, port 5432)
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Only manage the public schema. auth/storage/etc. belong to Supabase.
  schemaFilter: ["public"],
  // Supabase already ships the anon/authenticated/service_role roles.
  entities: {
    roles: { provider: "supabase" },
  },
  strict: true,
  verbose: true,
});
