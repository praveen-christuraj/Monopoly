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

  if (error || !data.user?.email) {
    return null;
  }

  return data.user;
}

export async function createSession(userId: string): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

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
  if (!supabaseUser?.email) {
    return null;
  }

  const displayName =
    typeof supabaseUser.user_metadata?.display_name === "string" &&
    supabaseUser.user_metadata.display_name.trim().length > 0
      ? supabaseUser.user_metadata.display_name.trim().slice(0, 20)
      : supabaseUser.email.split("@")[0].slice(0, 20);

  const [linkedUser] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.authUserId, supabaseUser.id));

  if (linkedUser) {
    const [updatedLinkedUser] = await db
      .update(users)
      .set({
        email: supabaseUser.email,
        displayName,
        authUserId: supabaseUser.id,
      })
      .where(eq(users.id, linkedUser.id))
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      });

    return updatedLinkedUser;
  }

  const [emailMatchedUser] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.email, supabaseUser.email));

  if (emailMatchedUser) {
    const [updatedEmailMatchedUser] = await db
      .update(users)
      .set({
        email: supabaseUser.email,
        displayName,
        authUserId: supabaseUser.id,
      })
      .where(eq(users.id, emailMatchedUser.id))
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      });
    return updatedEmailMatchedUser;
  }

  const [appUser] = await db
    .insert(users)
    .values({
      authUserId: supabaseUser.id,
      email: supabaseUser.email,
      displayName,
    })
    .returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    });

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
