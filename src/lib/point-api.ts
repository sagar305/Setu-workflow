import { NextResponse } from "next/server";
import { AppError } from "./errors";
import {
  createPoint,
  changePoint,
  listPoints,
  getPoint,
  pointOptions,
  pointAttachmentUnavailable,
} from "./points";
export async function pointGet(
  token: string | undefined,
  path: string[],
  query: URLSearchParams,
) {
  if (path.length === 2 && path[1] === "mine")
    return NextResponse.json(
      await listPoints(token, null, Object.fromEntries(query), true),
    );
  if (path.length === 3 && path[1] === "engagement")
    return NextResponse.json(
      await listPoints(token, path[2], Object.fromEntries(query)),
    );
  if (path.length === 4 && path[1] === "engagement" && path[3] === "options")
    return NextResponse.json(await pointOptions(token, path[2]));
  if (path.length === 2)
    return NextResponse.json(
      await getPoint(token, path[1], Number(query.get("page") ?? 1)),
    );
  if (path.length >= 3 && path[2] === "attachments")
    await pointAttachmentUnavailable(token, path[1]);
  throw new AppError("Not found.", 404);
}
export async function pointPost(
  token: string | undefined,
  path: string[],
  input: unknown,
) {
  if (path.length === 3 && path[1] === "engagement")
    return NextResponse.json(await createPoint(token, path[2], input));
  if (path.length === 2)
    return NextResponse.json(await changePoint(token, path[1], input));
  if (path.length === 3 && path[2] === "attachments")
    await pointAttachmentUnavailable(token, path[1], true);
  if (path.length === 5 && path[2] === "responses" && path[4] === "attachments")
    await pointAttachmentUnavailable(token, path[1], true, path[3]);
  throw new AppError("Not found.", 404);
}
