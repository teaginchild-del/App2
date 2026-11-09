// Mints a Supabase-style access token for local testing against PostgREST.
//   node scripts/mint-test-jwt.mjs <jwt-secret> <user-id> [email]
// The user id must exist in auth.users (and be approved) for data access.
import { createHmac } from 'node:crypto'

const [secret, sub, email = ''] = process.argv.slice(2)
if (!secret || !sub) {
  console.error('usage: node scripts/mint-test-jwt.mjs <jwt-secret> <user-id> [email]')
  process.exit(1)
}
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 })}`
console.log(`${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`)
