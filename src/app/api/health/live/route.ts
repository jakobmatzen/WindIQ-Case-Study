import { connection } from "next/server";

/**
 * Liveness: is the web process up? No DB access.
 * Used by Docker's healthcheck so a DB/API outage doesn't restart-loop the container.
 */
export async function GET() {
  await connection(); // never prerender: must run on every request
  return Response.json({ status: "ok" });
}
