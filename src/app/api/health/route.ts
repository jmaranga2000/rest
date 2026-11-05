import { getDb } from "@/platform/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const db = await getDb();
    await db.col("plans").count({});
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "degraded" }, { status: 503 });
  }
}
