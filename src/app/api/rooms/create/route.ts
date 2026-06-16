import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rooms, players, roomEvents } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { createInitialGameState } from "@/lib/game-engine";
import { PLAYER_COLORS, PLAYER_TOKENS } from "@/lib/monopoly-data";
import { normalizeMaxPlayers } from "@/lib/validation";

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generatePlayerId(): string {
  return "p_" + Math.random().toString(36).substring(2, 15);
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "Please log in to create a room" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const maxPlayers = normalizeMaxPlayers(body?.maxPlayers) ?? 4;

    let code = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateRoomCode();
      const [existingRoom] = await db
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.code, candidate));

      if (!existingRoom) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      return NextResponse.json(
        { error: "Failed to reserve a room code. Please try again." },
        { status: 500 }
      );
    }

    const playerId = generatePlayerId();
    const gameState = createInitialGameState();

    const [room] = await db
      .insert(rooms)
      .values({
        code,
        hostId: playerId,
        hostUserId: user.id,
        maxPlayers,
        gameState,
        status: "waiting",
      })
      .returning();

    await db.insert(players).values({
      roomId: room.id,
      userId: user.id,
      playerId,
      name: user.displayName.slice(0, 20),
      color: PLAYER_COLORS[0],
      position: 0,
      money: 1500,
      turnOrder: 0,
      properties: [],
      lastSeenAt: new Date(),
    });

    await db.insert(roomEvents).values({
      roomId: room.id,
      stateVersion: room.stateVersion,
      eventType: "room-created",
    });

    return NextResponse.json({
      roomId: room.id,
      code: room.code,
      playerId,
      token: PLAYER_TOKENS[0],
    });
  } catch (error) {
    console.error("Create room error:", error);
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 }
    );
  }
}
