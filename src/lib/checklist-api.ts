import { NextResponse } from "next/server";
import { AppError } from "./errors";
import {
  getChecklist,
  checklistDetail,
  createChecklistItem,
  updateChecklistItem,
  myChecklist,
  checklistAttachmentUnavailable,
} from "./checklists";
export async function checklistGet(
  token: string | undefined,
  path: string[],
  query: URLSearchParams,
) {
  if (path.length === 2 && path[1] === "mine")
    return NextResponse.json(
      await myChecklist(token, Number(query.get("page") ?? 1)),
    );
  if (path.length === 3 && path[1] === "engagement")
    return NextResponse.json(await getChecklist(token, path[2]));
  if (path.length === 2)
    return NextResponse.json(await checklistDetail(token, path[1]));
  if (path.length >= 3 && path[2] === "attachments")
    await checklistAttachmentUnavailable(token, path[1]);
  throw new AppError("Not found.", 404);
}
export async function checklistPost(
  token: string | undefined,
  path: string[],
  input: unknown,
) {
  if (path.length === 3 && path[1] === "engagement")
    return NextResponse.json(await createChecklistItem(token, path[2], input));
  if (path.length === 2)
    return NextResponse.json(await updateChecklistItem(token, path[1], input));
  if (path.length === 3 && path[2] === "attachments")
    await checklistAttachmentUnavailable(token, path[1], true);
  throw new AppError("Not found.", 404);
}
