import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { reportData, exportReport } from "./reports";
import { dashboardData } from "./dashboard";
export async function reportGet(
  token: string | undefined,
  path: string[],
  query: URLSearchParams,
) {
  const input = Object.fromEntries(query);
  if (path.length === 1 && path[0] === "dashboard")
    return NextResponse.json(await dashboardData(token, input), {
      headers: { "Cache-Control": "no-store" },
    });
  if (path.length === 1 && path[0] === "reports")
    return NextResponse.json(await reportData(token, input), {
      headers: { "Cache-Control": "no-store" },
    });
  if (path.length === 2 && path[0] === "reports" && path[1] === "export") {
    const result = await exportReport(token, input);
    return new NextResponse(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="setu-${result.kind}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  throw new AppError("Not found.", 404);
}
