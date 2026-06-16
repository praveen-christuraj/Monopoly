import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import type { PresenceStatus } from "@/lib/presence";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const SESSION_COOKIE_NAME = "monopoly_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  lastSeenAt: string;
  presenceStatus: PresenceStatus;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

export async function getSupabaseAuthUser(accessToken: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  // #region debug-point B:supabase-auth-user
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "auth-sync-failure",
      runId: "pre-fix",
      hypothesisId: "B",
      location: "src/lib/auth.ts:35",
      msg: "[DEBUG] Supabase auth user lookup completed",
      data: {
        hasUser: Boolean(data.user),
        email: data.user?.email ?? null,
        error: error ? { name: error.name, message: error.message, status: error.status ?? null } : null,
      },
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (error || !data.user?.email) {
    return null;
  }

  return data.user;
}

export async function createSession(userId: string): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  // #region debug-point D:create-session-start
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "auth-sync-failure",
      runId: "pre-fix",
      hypothesisId: "D",
      location: "src/lib/auth.ts:48",
      msg: "[DEBUG] Starting local session creation",
      data: { userId, expiresAt: expiresAt.toISOString() },
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  await db.insert(sessions).values({
    tokenHash,
    userId,
    expiresAt,
    lastSeenAt: new Date(),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  // #region debug-point D:create-session-success
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "auth-sync-failure",
      runId: "pre-fix",
      hypothesisId: "D",
      location: "src/lib/auth.ts:73",
      msg: "[DEBUG] Local session persisted and cookie set",
      data: { userId },
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)));
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function upsertAppUserFromSupabase(accessToken: string) {
  const supabaseUser = await getSupabaseAuthUser(accessToken);
  // #region debug-point C:upsert-input
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "auth-sync-failure",
      runId: "pre-fix",
      hypothesisId: "C",
      location: "src/lib/auth.ts:105",
      msg: "[DEBUG] Preparing app user upsert from Supabase user",
      data: {
        hasSupabaseUser: Boolean(supabaseUser),
        userId: supabaseUser?.id ?? null,
        email: supabaseUser?.email ?? null,
      },
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (!supabaseUser?.email) {
    return null;
  }

  const displayName =
    typeof supabaseUser.user_metadata?.display_name === "string" &&
    supabaseUser.user_metadata.display_name.trim().length > 0
      ? supabaseUser.user_metadata.display_name.trim().slice(0, 20)
      : supabaseUser.email.split("@")[0].slice(0, 20);

  const [appUser] = await db
    .insert(users)
    .values({
      id: supabaseUser.id,
      email: supabaseUser.email,
      displayName,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: supabaseUser.email,
        displayName,
      },
    })
    .returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    });
  // #region debug-point C:upsert-output
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "auth-sync-failure",
      runId: "pre-fix",
      hypothesisId: "C",
      location: "src/lib/auth.ts:139",
      msg: "[DEBUG] App user upsert completed",
      data: { appUserId: appUser?.id ?? null, email: appUser?.email ?? null, displayName: appUser?.displayName ?? null },
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return appUser;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  const [session] = await db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)));

  if (!session) {
    await clearSession();
    return null;
  }

  await db
    .update(sessions)
    .set({ lastSeenAt: now })
    .where(eq(sessions.tokenHash, tokenHash));

  return {
    id: session.userId,
    email: session.email,
    displayName: session.displayName,
    lastSeenAt: now.toISOString(),
    presenceStatus: "online",
  };
}
