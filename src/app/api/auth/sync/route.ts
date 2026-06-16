import { NextResponse } from "next/server";
import {
  clearSession,
  createSession,
  getBearerToken,
  upsertAppUserFromSupabase,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const accessToken = getBearerToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing Supabase access token" },
        { status: 401 }
      );
    }

    const user = await upsertAppUserFromSupabase(accessToken);
    if (!user) {
      return NextResponse.json(
        { error: "Supabase session is invalid or expired" },
        { status: 401 }
      );
    }

    await clearSession();
    await createSession(user.id);

    return NextResponse.json({
      user: {
        ...user,
        lastSeenAt: new Date().toISOString(),
        presenceStatus: "online",
      },
    });
  } catch (error) {
    console.error("Auth sync error:", error);
    return NextResponse.json(
      { error: "Failed to synchronize account" },
      { status: 500 }
    );
  }
}
