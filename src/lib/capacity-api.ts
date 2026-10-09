import { NextResponse } from "next/server";
import { AppError } from "./errors";
import {
  teamCapacity,
  saveCapacityAdjustment,
  cancelCapacityAdjustment,
} from "./capacity";
export async function capacityGet(
  token: string | undefined,
  path: string[],
  query: URLSearchParams,
) {
  if (path.length === 1)
    return NextResponse.json(
      await teamCapacity(token, Object.fromEntries(query)),
    );
  throw new AppError("Not found.", 404);
}
export async function capacityPost(
  token: string | undefined,
  path: string[],
  input: unknown,
) {
  if (path[1] === "adjustments" && path.length === 2)
    return NextResponse.json(await saveCapacityAdjustment(token, input));
  if (path[1] === "adjustments" && path.length === 3)
    return NextResponse.json(
      await saveCapacityAdjustment(token, input, path[2]),
    );
  if (path[1] === "adjustments" && path.length === 4 && path[3] === "cancel")
    return NextResponse.json(
      await cancelCapacityAdjustment(token, path[2], input),
    );
  throw new AppError("Not found.", 404);
}
