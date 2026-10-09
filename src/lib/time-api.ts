import { NextResponse } from "next/server";
import { AppError } from "./errors";
import {
  createTime,
  changeTime,
  timeOptions,
  myTime,
  engagementTime,
  engagementHours,
} from "./time";
export async function timeGet(
  token: string | undefined,
  path: string[],
  query: URLSearchParams,
) {
  if (path.length === 2 && path[1] === "options")
    return NextResponse.json(
      await timeOptions(token, query.get("engagementId") || undefined),
    );
  if (path.length === 1)
    return NextResponse.json(
      await myTime(
        token,
        query.get("view") ?? "week",
        query.get("weekOf") || undefined,
      ),
    );
  if (path.length === 3 && path[1] === "engagement")
    return NextResponse.json(await engagementTime(token, path[2]));
  if (path.length === 3 && path[1] === "budget")
    return NextResponse.json(await engagementHours(token, path[2]));
  throw new AppError("Not found.", 404);
}
export async function timePost(
  token: string | undefined,
  path: string[],
  input: unknown,
) {
  if (path.length === 1)
    return NextResponse.json(await createTime(token, input));
  if (path.length === 2)
    return NextResponse.json(await changeTime(token, path[1], input));
  throw new AppError("Not found.", 404);
}
