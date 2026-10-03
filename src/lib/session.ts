import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { principal } from './auth';
import { AppError } from './errors';
export const cookieName = process.env.NODE_ENV === 'production' ? '__Host-setu_session' : 'setu_session';
export async function sessionToken() { return (await cookies()).get(cookieName)?.value; }
export async function currentUser() {
  try { return await principal(await sessionToken()); }
  catch (error) { if (error instanceof AppError && error.status === 401) redirect('/login'); throw error; }
}
