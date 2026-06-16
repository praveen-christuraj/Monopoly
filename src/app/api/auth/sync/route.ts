import { NextResponse } from "next/server";
import {
  createSession,
  getBearerToken,
  upsertAppUserFromSupabase,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const accessToken = getBearerToken(request);
    // #region debug-point A:sync-route-token
    fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "auth-sync-failure",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "src/app/api/auth/sync/route.ts:10",
        msg: "[DEBUG] Auth sync route received request",
        data: { hasAccessToken: Boolean(accessToken), tokenLength: accessToken?.length ?? 0 },
        ts: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing Supabase access token" },
        { status: 401 }
      );
    }

    const user = await upsertAppUserFromSupabase(accessToken);
    // #region debug-point C:sync-route-user
    fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "auth-sync-failure",
        runId: "pre-fix",
        hypothesisId: "C",
        location: "src/app/api/auth/sync/route.ts:19",
        msg: "[DEBUG] Auth sync route completed user upsert attempt",
        data: { userFound: Boolean(user), userId: user?.id ?? null, email: user?.email ?? null },
        ts: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!user) {
      return NextResponse.json(
        { error: "Supabase session is invalid or expired" },
        { status: 401 }
      );
    }

    await createSession(user.id);
    // #region debug-point D:sync-route-session
    fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "auth-sync-failure",
        runId: "pre-fix",
        hypothesisId: "D",
        location: "src/app/api/auth/sync/route.ts:27",
        msg: "[DEBUG] Auth sync route created local session",
        data: { userId: user.id },
        ts: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return NextResponse.json({
      user: {
        ...user,
        lastSeenAt: new Date().toISOString(),
        presenceStatus: "online",
      },
    });
  } catch (error) {
    // #region debug-point E:sync-route-error
    fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "auth-sync-failure",
        runId: "pre-fix",
        hypothesisId: "E",
        location: "src/app/api/auth/sync/route.ts:41",
        msg: "[DEBUG] Auth sync route threw an error",
        data: {
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack ?? null }
              : { value: String(error) },
        },
        ts: Date.now(),
      }),
    }).catch(() => {});
    return NextResponse.json(
      { error: "Failed to synchronize account" },
      { status: 500 }
    );
  }
}
