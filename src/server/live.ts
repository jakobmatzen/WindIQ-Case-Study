import "server-only";
import { connection } from "next/server";
import { syncActivityToken } from "@/db";

/**
 * The current data version for the dashboard's live refresh: changes whenever the worker
 * starts or finishes a run. Throws when the database is unreachable.
 */
export async function getDataVersion(): Promise<string | null> {
  await connection();
  return syncActivityToken();
}
