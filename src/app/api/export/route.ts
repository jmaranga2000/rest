import { NextResponse } from "next/server";
import { getCtx } from "@/platform/http/request";
import { AppError, AuthenticationError, AuthorizationError, isAppError } from "@/platform/errors";
import { resolveScope } from "@/modules/reports/service";
import { parseRange } from "@/modules/reports/range";
import { isReportKey, reportRows } from "@/modules/reports/exports";
import { encodeCsv } from "@/modules/reports/csv";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await getCtx();
    if (!ctx) throw new AuthenticationError();
    if (!ctx.permissions.has("reports.export")) throw new AuthorizationError();
    const u = new URL(req.url);
    const key = u.searchParams.get("report") ?? "sales";
    if (!isReportKey(key)) throw new AppError("VALIDATION", "Unknown report.", 422);
    const scope = resolveScope(ctx, u.searchParams.get("branch"));
    const range = parseRange({ from: u.searchParams.get("from") ?? undefined, to: u.searchParams.get("to") ?? undefined, preset: u.searchParams.get("preset") ?? undefined }, scope.timezone);
    const csv = encodeCsv(await reportRows(ctx, key, scope, range));
    return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${key}-${range.from}_${range.to}.csv"`, "cache-control": "no-store" } });
  } catch (e) {
    if (isAppError(e)) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
