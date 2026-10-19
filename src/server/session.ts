import { db } from "./env";
import { sessions, users } from "./schema";
import { eq, lt } from "drizzle-orm";
import { randomToken } from "./crypto";

export const SESSION_COOKIE = "logbook_session";
const SESSION_TTL_DAYS = 30;

export type SessionUser = { id: string; email: string; name: string };

export async function requireUser(): Promise<SessionUser> {
  const token = await readSessionToken();
  if (!token) throw new Error("UNAUTHENTICATED");
  const [row] = await db()
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.token, token))
    .limit(1);
  if (!row || new Date(row.expiresAt) < new Date()) throw new Error("UNAUTHENTICATED");
  return { id: row.user.id, email: row.user.email, name: row.user.name };
}

export async function readSessionToken(): Promise<string | null> {
  // Server functions receive the incoming Request; parse the Cookie header.
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie
    .split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return match
    ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1))
    : null;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000,
  ).toISOString();
  await db().insert(sessions).values({ token, userId, expiresAt });
  // opportunistic cleanup
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString()));
  return token;
}

export async function destroySession(): Promise<void> {
  const token = await readSessionToken();
  if (token) await db().delete(sessions).where(eq(sessions.token, token));
}

export function sessionCookieValue(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_DAYS * 24 * 3600}`;
}

export function clearedSessionCookieValue(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
