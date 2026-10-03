import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export const newToken = () => randomBytes(32).toString('hex');
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt-32768-8-3:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string | null) {
  // Always perform the expensive operation, including unknown email addresses.
  const [, salt, expected] = (hash ?? 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128)).split(':');
  const key = await derive(password, salt);
  const target = Buffer.from(expected, 'hex');
  return target.length === key.length && timingSafeEqual(target, key) && hash !== null;
}
