import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { players, rooms } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ rooms: [] });
    }

    const memberships = await db
      .select({
        roomId: players.roomId,
        playerName: players.name,
        playerId: players.playerId,
      })
      .from(players)
      .where(eq(players.userId, user.id));

    if (memberships.length === 0) {
      return NextResponse.json({ rooms: [] });
    }

    const roomIds = memberships.map((membership) => membership.roomId);
    const roomRows = await db
      .select({
        id: rooms.id,
        code: rooms.code,
        status: rooms.status,
        updatedAt: rooms.updatedAt,
        hostId: rooms.hostId,
        maxPlayers: rooms.maxPlayers,
        currentTurnIndex: rooms.currentTurnIndex,
      })
      .from(rooms)
      .where(inArray(rooms.id, roomIds))
      .orderBy(desc(rooms.updatedAt));

    const roomPlayers = await db
      .select({
        roomId: players.roomId,
        playerId: players.playerId,
        name: players.name,
        turnOrder: players.turnOrder,
        isBankrupt: players.isBankrupt,
      })
      .from(players)
      .where(inArray(players.roomId, roomIds));

    const roomSummaries = roomRows.map((room) => {
      const membership = memberships.find((entry) => entry.roomId === room.id);
      const playersInRoom = roomPlayers
        .filter((entry) => entry.roomId === room.id)
        .sort((a, b) => a.turnOrder - b.turnOrder);
      const activePlayers = playersInRoom.filter((entry) => !entry.isBankrupt);
      const currentTurnPlayer =
        activePlayers.length > 0
          ? activePlayers[room.currentTurnIndex % activePlayers.length]
          : null;
      const isActive = room.status !== "finished";
      const summary =
        room.status === "waiting"
          ? `Waiting room • ${playersInRoom.length}/${room.maxPlayers} players`
          : room.status === "playing"
          ? `${currentTurnPlayer?.name ?? "Unknown"}'s turn • ${activePlayers.length} active players`
          : `Finished • ${playersInRoom.length} total players`;

      return {
        roomId: room.id,
        code: room.code,
        status: room.status,
        updatedAt: room.updatedAt.toISOString(),
        playerName: membership?.playerName ?? user.displayName,
        isHost: membership?.playerId === room.hostId,
        isActive,
        playerCount: playersInRoom.length,
        maxPlayers: room.maxPlayers,
        currentTurnPlayerName: currentTurnPlayer?.name ?? null,
        summary,
      };
    });

    return NextResponse.json({ rooms: roomSummaries });
  } catch (error) {
    console.error("Load my rooms error:", error);
    return NextResponse.json(
      { error: "Failed to load your rooms" },
      { status: 500 }
    );
  }
}
