import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppError } from "./errors";
import { isPlatformRoute, platformCookie, platformPrincipal } from "./platform";

/** For console pages: 404 off the secret route, sign-in page without a session. */
export async function consolePage(params: Promise<{ secret: string }>) {
  const { secret } = await params;
  if (!isPlatformRoute(secret)) notFound();
  const base = `/console/${secret}`;
  try {
    const admin = await platformPrincipal((await cookies()).get(platformCookie)?.value);
    return { admin, base, secret };
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect(`${base}/login`);
    throw error;
  }
}
