import { getDataVersion } from "@/server/live";

/**
 * The data version the dashboard polls to know when to re-render: one cheap query.
 * 503 when the database is unreachable; the page then simply keeps what it shows.
 */
export async function GET() {
  try {
    const version = await getDataVersion();
    return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[version] database check failed", error);
    return Response.json(
      { version: null },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
