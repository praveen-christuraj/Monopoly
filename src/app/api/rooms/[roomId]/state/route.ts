import { NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, players, gameLog } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { getPresenceStatus } from "@/lib/presence";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "Please log in to view this game" },
        { status: 401 }
      );
    }

    const { roomId } = await params;

    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const [viewerPlayer] = await db
      .select()
      .from(players)
      .where(and(eq(players.roomId, roomId), eq(players.userId, user.id)));

    if (!viewerPlayer) {
      return NextResponse.json(
        { error: "You are not a player in this room" },
        { status: 403 }
      );
    }

    await db
      .update(players)
      .set({ lastSeenAt: new Date() })
      .where(eq(players.id, viewerPlayer.id));

    const roomPlayers = await db
      .select()
      .from(players)
      .where(eq(players.roomId, roomId));

    const logs = await db
      .select()
      .from(gameLog)
      .where(eq(gameLog.roomId, roomId))
      .orderBy(desc(gameLog.createdAt))
      .limit(30);

    return NextResponse.json({
      room: {
        id: room.id,
        code: room.code,
        hostId: room.hostId,
        hostUserId: room.hostUserId,
        status: room.status,
        maxPlayers: room.maxPlayers,
        currentTurnIndex: room.currentTurnIndex,
        stateVersion: room.stateVersion,
        gameState: room.gameState,
        updatedAt: room.updatedAt,
      },
      players: roomPlayers.map((p) => ({
        id: p.id,
        userId: p.userId,
        playerId: p.playerId,
        name: p.name,
        color: p.color,
        position: p.position,
        money: p.money,
        isActive: p.isActive,
        isBankrupt: p.isBankrupt,
        inJail: p.inJail,
        jailTurns: p.jailTurns,
        getOutOfJailCards: p.getOutOfJailCards,
        properties: p.properties,
        turnOrder: p.turnOrder,
        doublesCount: p.doublesCount,
        lastSeenAt: p.lastSeenAt.toISOString(),
        presenceStatus: getPresenceStatus(p.lastSeenAt),
      })),
      logs: logs.reverse(),
      viewerPlayerId: viewerPlayer.playerId,
    });
  } catch (error) {
    console.error("Get state error:", error);
    return NextResponse.json(
      { error: "Failed to get room state" },
      { status: 500 }
    );
  }
}
