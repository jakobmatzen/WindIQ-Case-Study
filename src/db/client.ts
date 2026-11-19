import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Shared by the Next.js app and the worker. Only import from server-side code.
// Connection is created lazily so `next build` works without DATABASE_URL.

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const client = postgres(connectionString, {
    // Required for Supabase's transaction pooler (port 6543).
    prepare: false,
    max: 5,
    connect_timeout: 10,
    idle_timeout: 30,
  });
  return drizzle(client, { schema });
}

type Db = ReturnType<typeof createDb>;

// Reuse one pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { db?: Db };

export function getDb(): Db {
  globalForDb.db ??= createDb();
  return globalForDb.db;
}
