import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
import {
  normalizeDisplayName,
  normalizeEmail,
  normalizePassword,
} from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body?.email);
    const displayName = normalizeDisplayName(body?.displayName);
    const password = normalizePassword(body?.password);

    if (!email || !displayName || !password) {
      return NextResponse.json(
        { error: "Enter a valid email, display name, and password" },
        { status: 400 }
      );
    }

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with that email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({
        email,
        displayName,
        passwordHash,
      })
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      });

    await createSession(user.id);

    return NextResponse.json({
      user: {
        ...user,
        lastSeenAt: new Date().toISOString(),
        presenceStatus: "online",
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
