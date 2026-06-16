import { NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, players, roomEvents } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { PLAYER_COLORS, PLAYER_TOKENS } from "@/lib/monopoly-data";
import { normalizeRoomCode } from "@/lib/validation";

function generatePlayerId(): string {
  return "p_" + Math.random().toString(36).substring(2, 15);
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "Please log in to join a room" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const code = normalizeRoomCode(body?.code);

    if (!code) {
      return NextResponse.json(
        { error: "Enter a valid 6-character room code" },
        { status: 400 }
      );
    }

    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.code, code.toUpperCase()));

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const [existingMembership] = await db
      .select()
      .from(players)
      .where(and(eq(players.roomId, room.id), eq(players.userId, user.id)));

    if (existingMembership) {
      return NextResponse.json({
        roomId: room.id,
        code: room.code,
        playerId: existingMembership.playerId,
        token: PLAYER_TOKENS[existingMembership.turnOrder] || PLAYER_TOKENS[0],
        resumed: true,
      });
    }

    if (room.status !== "waiting") {
      return NextResponse.json(
        { error: "Game already started" },
        { status: 400 }
      );
    }

    const existingPlayers = await db
      .select()
      .from(players)
      .where(eq(players.roomId, room.id));

    if (existingPlayers.length >= room.maxPlayers) {
      return NextResponse.json({ error: "Room is full" }, { status: 400 });
    }

    const playerId = generatePlayerId();
    const colorIndex = existingPlayers.length % PLAYER_COLORS.length;

    await db.insert(players).values({
      roomId: room.id,
      userId: user.id,
      playerId,
      name: user.displayName.slice(0, 20),
      color: PLAYER_COLORS[colorIndex],
      position: 0,
      money: 1500,
      turnOrder: existingPlayers.length,
      properties: [],
      lastSeenAt: new Date(),
    });

    await db.insert(roomEvents).values({
      roomId: room.id,
      stateVersion: room.stateVersion,
      eventType: "player-joined",
    });

    return NextResponse.json({
      roomId: room.id,
      code: room.code,
      playerId,
      token: PLAYER_TOKENS[colorIndex],
    });
  } catch (error) {
    console.error("Join room error:", error);
    return NextResponse.json(
      { error: "Failed to join room" },
      { status: 500 }
    );
  }
}
