// Signs an HS256 JWT like Supabase Auth would, for the local e2e stack.
import { createHmac } from 'node:crypto';
export const E2E_SECRET = process.env.E2E_JWT_SECRET ?? 'local-e2e-secret-local-e2e-secret-0123456789';
export const E2E_USER_ID = '00000000-0000-4000-8000-000000000001';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function signJwt(claims = {}) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: E2E_USER_ID, role: 'authenticated', aud: 'authenticated', exp, ...claims })}`;
  return `${body}.${createHmac('sha256', E2E_SECRET).update(body).digest('base64url')}`;
}
if (process.argv[1]?.endsWith('jwt.mjs')) console.log(signJwt());
