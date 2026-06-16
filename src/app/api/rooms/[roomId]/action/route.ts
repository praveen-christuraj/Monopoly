import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rooms, players, gameLog, roomEvents } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  rollDice,
  isDoubles,
  calculateRent,
  getPropertyOwner,
  getNextChanceCard,
  getNextCommunityChestCard,
  countPlayerHouses,
  ownsFullColorGroup,
  type GameState,
} from "@/lib/game-engine";
import { BOARD_SPACES } from "@/lib/monopoly-data";
import {
  normalizeExpectedStateVersion,
  normalizeSpaceIndex,
} from "@/lib/validation";

type DbClient = Pick<typeof db, "select" | "insert" | "update">;

const ALLOWED_ACTIONS = new Set([
  "start-game",
  "roll-dice",
  "buy-property",
  "skip-buy",
  "end-turn",
  "build-house",
  "mortgage",
  "unmortgage",
  "pay-jail-fee",
  "use-jail-card",
  "sell-house",
]);

async function addLog(
  client: DbClient,
  roomId: string,
  playerId: string | null,
  action: string,
  details?: Record<string, unknown>
) {
  await client
    .insert(gameLog)
    .values({ roomId, playerId, action, details: details ?? {} });
}

async function updateRoomSnapshot(
  client: DbClient,
  roomId: string,
  expectedStateVersion: number,
  values: Partial<{
    status: string;
    currentTurnIndex: number;
    gameState: GameState;
  }>,
  eventType?: string
): Promise<boolean> {
  const [updatedRoom] = await client
    .update(rooms)
    .set({
      ...values,
      stateVersion: expectedStateVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(eq(rooms.id, roomId), eq(rooms.stateVersion, expectedStateVersion))
    )
    .returning({ id: rooms.id });

  if (updatedRoom && eventType) {
    await client.insert(roomEvents).values({
      roomId,
      stateVersion: expectedStateVersion + 1,
      eventType,
    });
  }

  return Boolean(updatedRoom);
}

function staleStateResponse(currentStateVersion: number) {
  return NextResponse.json(
    {
      error: "Game state changed in another tab or action. Please wait for re-sync.",
      currentStateVersion,
    },
    { status: 409 }
  );
}

async function handleCard(
  client: DbClient,
  card: { text: string; action: string; value?: number; destination?: number },
  player: {
    id: string;
    playerId: string;
    position: number;
    money: number;
    getOutOfJailCards: number;
  },
  allPlayers: Array<{
    id: string;
    playerId: string;
    money: number;
    isBankrupt: boolean;
  }>,
  gameState: GameState
): Promise<string> {
  switch (card.action) {
    case "move": {
      const dest = card.destination ?? 0;
      const passGo = dest < player.position && dest !== player.position;
      const goBonus = passGo ? 200 : 0;
      await client
        .update(players)
        .set({
          position: dest,
          money: player.money + goBonus,
        })
        .where(eq(players.id, player.id));
      return "end-turn";
    }
    case "collect": {
      await client
        .update(players)
        .set({ money: player.money + (card.value || 0) })
        .where(eq(players.id, player.id));
      return "end-turn";
    }
    case "pay": {
      const newMoney = player.money - (card.value || 0);
      gameState.freeParking += card.value || 0;
      await client
        .update(players)
        .set({ money: Math.max(0, newMoney) })
        .where(eq(players.id, player.id));
      if (newMoney < 0) {
        await client
          .update(players)
          .set({ isBankrupt: true, isActive: false })
          .where(eq(players.id, player.id));
      }
      return "end-turn";
    }
    case "go-to-jail": {
      await client
        .update(players)
        .set({ position: 10, inJail: true, jailTurns: 0 })
        .where(eq(players.id, player.id));
      return "end-turn";
    }
    case "get-out-of-jail": {
      await client
        .update(players)
        .set({ getOutOfJailCards: (player.getOutOfJailCards || 0) + 1 })
        .where(eq(players.id, player.id));
      return "end-turn";
    }
    case "move-back": {
      const newPos = (player.position - (card.value || 3) + 40) % 40;
      await client
        .update(players)
        .set({ position: newPos })
        .where(eq(players.id, player.id));
      return "end-turn";
    }
    case "pay-each": {
      const others = allPlayers.filter(
        (entry) => entry.playerId !== player.playerId && !entry.isBankrupt
      );
      const totalPay = others.length * (card.value || 0);
      await client
        .update(players)
        .set({ money: Math.max(0, player.money - totalPay) })
        .where(eq(players.id, player.id));
      for (const other of others) {
        await client
          .update(players)
          .set({ money: other.money + (card.value || 0) })
          .where(eq(players.id, other.id));
      }
      return "end-turn";
    }
    case "collect-each": {
      const others = allPlayers.filter(
        (entry) => entry.playerId !== player.playerId && !entry.isBankrupt
      );
      const totalCollect = others.length * (card.value || 0);
      await client
        .update(players)
        .set({ money: player.money + totalCollect })
        .where(eq(players.id, player.id));
      for (const other of others) {
        await client
          .update(players)
          .set({ money: Math.max(0, other.money - (card.value || 0)) })
          .where(eq(players.id, other.id));
      }
      return "end-turn";
    }
    case "repairs": {
      const { houses, hotels } = countPlayerHouses(gameState, player.playerId);
      const cost =
        houses * (card.value || 25) +
        hotels * (card.value === 25 ? 100 : 115);
      gameState.freeParking += cost;
      await client
        .update(players)
        .set({ money: Math.max(0, player.money - cost) })
        .where(eq(players.id, player.id));
      return "end-turn";
    }
    case "nearest-railroad": {
      const railroads = [5, 15, 25, 35];
      let nearest = railroads[0];
      for (const railroad of railroads) {
        if (railroad > player.position) {
          nearest = railroad;
          break;
        }
      }
      const passGo = nearest < player.position;
      await client
        .update(players)
        .set({
          position: nearest,
          money: player.money + (passGo ? 200 : 0),
        })
        .where(eq(players.id, player.id));
      return "end-turn";
    }
    case "nearest-utility": {
      const utilities = [12, 28];
      let nearest = utilities[0];
      for (const utility of utilities) {
        if (utility > player.position) {
          nearest = utility;
          break;
        }
      }
      const passGo = nearest < player.position;
      await client
        .update(players)
        .set({
          position: nearest,
          money: player.money + (passGo ? 200 : 0),
        })
        .where(eq(players.id, player.id));
      return "end-turn";
    }
    default:
      return "end-turn";
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "Please log in to continue" },
        { status: 401 }
      );
    }

    const { roomId } = await params;
    const body = await request.json();
    const action = String(body?.action ?? "");
    const expectedStateVersion = normalizeExpectedStateVersion(
      body?.expectedStateVersion
    );
    const spaceIndex = normalizeSpaceIndex(body?.spaceIndex);

    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    if (expectedStateVersion === null) {
      return NextResponse.json(
        { error: "Missing or invalid game state version" },
        { status: 400 }
      );
    }

    if (
      ["build-house", "mortgage", "unmortgage", "sell-house"].includes(action) &&
      spaceIndex === null
    ) {
      return NextResponse.json(
        { error: "Missing or invalid property selection" },
        { status: 400 }
      );
    }

    return await db.transaction(async (tx) => {
      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId));
      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }

      if (room.stateVersion !== expectedStateVersion) {
        return staleStateResponse(room.stateVersion);
      }

      const allPlayers = await tx
        .select()
        .from(players)
        .where(eq(players.roomId, roomId));

      const currentPlayer = allPlayers.find((entry) => entry.userId === user.id);
      if (!currentPlayer) {
        return NextResponse.json(
          { error: "You are not a player in this room" },
          { status: 403 }
        );
      }

      await tx
        .update(players)
        .set({ lastSeenAt: new Date() })
        .where(eq(players.id, currentPlayer.id));

      const actingPlayerId = currentPlayer.playerId;
      const gameState = room.gameState as GameState;

      if (!gameState) {
        return NextResponse.json(
          { error: "Game not initialized" },
          { status: 400 }
        );
      }

      if (action === "start-game") {
        if (actingPlayerId !== room.hostId) {
          return NextResponse.json(
            { error: "Only host can start" },
            { status: 403 }
          );
        }
        if (allPlayers.length < 2) {
          return NextResponse.json(
            { error: "Need at least 2 players" },
            { status: 400 }
          );
        }

        gameState.phase = "roll";
        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          {
            status: "playing",
            currentTurnIndex: 0,
            gameState,
          },
          "start-game"
        );
        if (!updated) {
          return staleStateResponse(room.stateVersion);
        }

        await addLog(tx, roomId, actingPlayerId, "Game started!");
        return NextResponse.json({ success: true });
      }

      if (room.status !== "playing") {
        return NextResponse.json(
          { error: "Game is not in progress" },
          { status: 400 }
        );
      }

      const activePlayers = allPlayers
        .filter((entry) => !entry.isBankrupt)
        .sort((a, b) => a.turnOrder - b.turnOrder);

      if (activePlayers.length <= 1) {
        gameState.phase = "game-over";
        gameState.winnerId = activePlayers[0]?.playerId ?? null;
        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          {
            status: "finished",
            gameState,
          },
          "game-over"
        );
        if (!updated) {
          return staleStateResponse(room.stateVersion);
        }
        await addLog(
          tx,
          roomId,
          null,
          `Game over! ${activePlayers[0]?.name ?? "Nobody"} wins!`
        );
        return NextResponse.json({ success: true });
      }

      const currentTurnPlayer =
        activePlayers[room.currentTurnIndex % activePlayers.length];

      if (action === "roll-dice") {
        if (currentTurnPlayer.playerId !== actingPlayerId) {
          return NextResponse.json({ error: "Not your turn" }, { status: 400 });
        }
        if (gameState.phase !== "roll") {
          return NextResponse.json(
            { error: "Cannot roll now" },
            { status: 400 }
          );
        }

        const dice = rollDice();
        gameState.lastDice = dice;
        const total = dice[0] + dice[1];
        const doubles = isDoubles(dice);
        const newDoublesCount = doubles
          ? (currentPlayer.doublesCount || 0) + 1
          : 0;

        if (newDoublesCount >= 3) {
          await tx
            .update(players)
            .set({
              position: 10,
              inJail: true,
              jailTurns: 0,
              doublesCount: 0,
            })
            .where(eq(players.id, currentPlayer.id));

          gameState.phase = "end-turn";
          const updated = await updateRoomSnapshot(
            tx,
            roomId,
            room.stateVersion,
            { gameState },
            "roll-dice"
          );
          if (!updated) return staleStateResponse(room.stateVersion);

          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} rolled doubles 3 times and goes to Jail! 🚔`
          );
          return NextResponse.json({ success: true, dice });
        }

        if (currentPlayer.inJail) {
          if (doubles) {
            await tx
              .update(players)
              .set({ inJail: false, jailTurns: 0, doublesCount: 0 })
              .where(eq(players.id, currentPlayer.id));
            await addLog(
              tx,
              roomId,
              actingPlayerId,
              `${currentPlayer.name} rolled doubles and gets out of Jail! 🎉`
            );
          } else {
            const newJailTurns = (currentPlayer.jailTurns || 0) + 1;
            if (newJailTurns >= 3) {
              await tx
                .update(players)
                .set({
                  inJail: false,
                  jailTurns: 0,
                  money: currentPlayer.money - 50,
                  doublesCount: 0,
                })
                .where(eq(players.id, currentPlayer.id));
              await addLog(
                tx,
                roomId,
                actingPlayerId,
                `${currentPlayer.name} paid $50 to get out of Jail after 3 turns.`
              );
            } else {
              await tx
                .update(players)
                .set({ jailTurns: newJailTurns, doublesCount: 0 })
                .where(eq(players.id, currentPlayer.id));
              gameState.phase = "end-turn";
              const updated = await updateRoomSnapshot(
                tx,
                roomId,
                room.stateVersion,
                { gameState },
                "roll-dice"
              );
              if (!updated) return staleStateResponse(room.stateVersion);
              await addLog(
                tx,
                roomId,
                actingPlayerId,
                `${currentPlayer.name} rolled ${dice[0]}+${dice[1]} but stays in Jail (turn ${newJailTurns}/3).`
              );
              return NextResponse.json({ success: true, dice });
            }
          }
        }

        const oldPos = currentPlayer.position;
        let newPos = (oldPos + total) % 40;
        const passedGo = newPos < oldPos && newPos !== 0;
        let moneyChange = 0;

        if (passedGo || newPos === 0) {
          moneyChange += 200;
          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} passed GO and collected $200! 💰`
          );
        }

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          `${currentPlayer.name} rolled ${dice[0]}+${dice[1]} and moved to ${BOARD_SPACES[newPos].name}.`
        );

        const space = BOARD_SPACES[newPos];
        if (space.type === "go-to-jail") {
          newPos = 10;
          await tx
            .update(players)
            .set({
              position: newPos,
              inJail: true,
              jailTurns: 0,
              money: currentPlayer.money + moneyChange,
              doublesCount: 0,
            })
            .where(eq(players.id, currentPlayer.id));
          gameState.phase = "end-turn";
          const updated = await updateRoomSnapshot(
            tx,
            roomId,
            room.stateVersion,
            { gameState },
            "roll-dice"
          );
          if (!updated) return staleStateResponse(room.stateVersion);
          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} goes to Jail! 🚔`
          );
          return NextResponse.json({ success: true, dice });
        }

        if (space.type === "tax") {
          moneyChange -= space.taxAmount || 0;
          gameState.freeParking += space.taxAmount || 0;
          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} pays $${space.taxAmount} tax.`
          );
        }

        if (space.type === "free-parking" && gameState.freeParking > 0) {
          moneyChange += gameState.freeParking;
          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} collects $${gameState.freeParking} from Free Parking! 🎉`
          );
          gameState.freeParking = 0;
        }

        await tx
          .update(players)
          .set({
            position: newPos,
            money: currentPlayer.money + moneyChange,
            doublesCount: newDoublesCount,
          })
          .where(eq(players.id, currentPlayer.id));

        if (
          space.type === "property" ||
          space.type === "railroad" ||
          space.type === "utility"
        ) {
          const propState = getPropertyOwner(gameState, newPos);
          if (!propState) {
            gameState.phase = "buy-decision";
          } else if (
            propState.ownerId !== actingPlayerId &&
            !propState.isMortgaged
          ) {
            const rentAmount = calculateRent(
              gameState,
              newPos,
              actingPlayerId,
              total
            );
            if (rentAmount > 0) {
              const payerNewMoney =
                currentPlayer.money + moneyChange - rentAmount;
              const owner = allPlayers.find(
                (entry) => entry.playerId === propState.ownerId
              );

              if (payerNewMoney < 0) {
                await tx
                  .update(players)
                  .set({ money: 0, isBankrupt: true, isActive: false })
                  .where(eq(players.id, currentPlayer.id));

                for (const property of gameState.properties) {
                  if (property.ownerId === actingPlayerId) {
                    property.ownerId = propState.ownerId;
                    property.houses = 0;
                    property.isMortgaged = false;
                  }
                }

                if (owner) {
                  await tx
                    .update(players)
                    .set({
                      money:
                        owner.money +
                        Math.max(0, currentPlayer.money + moneyChange),
                    })
                    .where(eq(players.id, owner.id));
                }

                await addLog(
                  tx,
                  roomId,
                  actingPlayerId,
                  `${currentPlayer.name} went bankrupt paying rent to ${owner?.name}! 💸`
                );
                gameState.phase = "end-turn";
              } else {
                await tx
                  .update(players)
                  .set({ money: payerNewMoney })
                  .where(eq(players.id, currentPlayer.id));
                if (owner) {
                  await tx
                    .update(players)
                    .set({ money: owner.money + rentAmount })
                    .where(eq(players.id, owner.id));
                }
                await addLog(
                  tx,
                  roomId,
                  actingPlayerId,
                  `${currentPlayer.name} paid $${rentAmount} rent to ${owner?.name}.`
                );
                gameState.phase = doubles ? "roll" : "end-turn";
              }
            } else {
              gameState.phase = doubles ? "roll" : "end-turn";
            }
          } else {
            gameState.phase = doubles ? "roll" : "end-turn";
          }
        } else if (space.type === "chance") {
          const card = getNextChanceCard(gameState);
          gameState.lastCard = card;
          const result = await handleCard(tx, card, currentPlayer, allPlayers, gameState);
          gameState.phase = result === "end-turn" || !doubles ? "end-turn" : "roll";
          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} drew Chance: "${card.text}"`
          );
        } else if (space.type === "community-chest") {
          const card = getNextCommunityChestCard(gameState);
          gameState.lastCard = card;
          const result = await handleCard(tx, card, currentPlayer, allPlayers, gameState);
          gameState.phase = result === "end-turn" || !doubles ? "end-turn" : "roll";
          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} drew Community Chest: "${card.text}"`
          );
        } else {
          gameState.phase = doubles ? "roll" : "end-turn";
        }

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "roll-dice"
        );
        if (!updated) return staleStateResponse(room.stateVersion);
        return NextResponse.json({ success: true, dice });
      }

      if (action === "buy-property") {
        if (currentTurnPlayer.playerId !== actingPlayerId) {
          return NextResponse.json({ error: "Not your turn" }, { status: 400 });
        }
        if (gameState.phase !== "buy-decision") {
          return NextResponse.json(
            { error: "No property to buy" },
            { status: 400 }
          );
        }

        const space = BOARD_SPACES[currentPlayer.position];
        if (!space.price) {
          return NextResponse.json(
            { error: "Cannot buy this space" },
            { status: 400 }
          );
        }

        const [freshPlayer] = await tx
          .select()
          .from(players)
          .where(eq(players.id, currentPlayer.id));
        if (freshPlayer.money < space.price) {
          return NextResponse.json(
            { error: "Not enough money" },
            { status: 400 }
          );
        }

        await tx
          .update(players)
          .set({ money: freshPlayer.money - space.price })
          .where(eq(players.id, currentPlayer.id));

        gameState.properties.push({
          spaceIndex: currentPlayer.position,
          ownerId: actingPlayerId,
          houses: 0,
          isMortgaged: false,
        });
        const doubles = gameState.lastDice ? isDoubles(gameState.lastDice) : false;
        gameState.phase = doubles ? "roll" : "end-turn";

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "buy-property"
        );
        if (!updated) return staleStateResponse(room.stateVersion);

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          `${currentPlayer.name} bought ${space.name} for $${space.price}! 🏠`
        );
        return NextResponse.json({ success: true });
      }

      if (action === "skip-buy") {
        if (currentTurnPlayer.playerId !== actingPlayerId) {
          return NextResponse.json({ error: "Not your turn" }, { status: 400 });
        }

        const doubles = gameState.lastDice ? isDoubles(gameState.lastDice) : false;
        gameState.phase = doubles ? "roll" : "end-turn";
        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "skip-buy"
        );
        if (!updated) return staleStateResponse(room.stateVersion);

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          `${currentPlayer.name} passed on buying ${BOARD_SPACES[currentPlayer.position].name}.`
        );
        return NextResponse.json({ success: true });
      }

      if (action === "end-turn") {
        if (currentTurnPlayer.playerId !== actingPlayerId) {
          return NextResponse.json({ error: "Not your turn" }, { status: 400 });
        }

        const freshActivePlayers = allPlayers
          .filter((entry) => !entry.isBankrupt)
          .sort((a, b) => a.turnOrder - b.turnOrder);

        if (freshActivePlayers.length <= 1) {
          gameState.phase = "game-over";
          gameState.winnerId = freshActivePlayers[0]?.playerId ?? null;
          const updated = await updateRoomSnapshot(
            tx,
            roomId,
            room.stateVersion,
            {
              status: "finished",
              gameState,
            },
            "game-over"
          );
          if (!updated) return staleStateResponse(room.stateVersion);
          await addLog(
            tx,
            roomId,
            null,
            `🏆 Game over! ${freshActivePlayers[0]?.name ?? "Nobody"} wins!`
          );
          return NextResponse.json({ success: true });
        }

        gameState.phase = "roll";
        gameState.lastCard = null;
        gameState.turnCount += 1;

        await tx
          .update(players)
          .set({ doublesCount: 0 })
          .where(eq(players.id, currentPlayer.id));

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          {
            currentTurnIndex:
              (room.currentTurnIndex + 1) % freshActivePlayers.length,
            gameState,
          },
          "end-turn"
        );
        if (!updated) return staleStateResponse(room.stateVersion);

        return NextResponse.json({ success: true });
      }

      if (action === "build-house") {
        const propertyIndex = spaceIndex as number;
        const space = BOARD_SPACES[propertyIndex];
        if (!space || space.type !== "property") {
          return NextResponse.json({ error: "Invalid space" }, { status: 400 });
        }

        const prop = gameState.properties.find(
          (entry) =>
            entry.spaceIndex === propertyIndex && entry.ownerId === actingPlayerId
        );
        if (!prop) {
          return NextResponse.json(
            { error: "You don't own this property" },
            { status: 400 }
          );
        }
        if (!ownsFullColorGroup(gameState, actingPlayerId, space.colorGroup)) {
          return NextResponse.json(
            { error: "Need full color group" },
            { status: 400 }
          );
        }
        if (prop.houses >= 5) {
          return NextResponse.json(
            { error: "Maximum buildings reached" },
            { status: 400 }
          );
        }

        const cost = space.houseCost || 0;
        const [freshPlayer] = await tx
          .select()
          .from(players)
          .where(eq(players.id, currentPlayer.id));
        if (freshPlayer.money < cost) {
          return NextResponse.json(
            { error: "Not enough money" },
            { status: 400 }
          );
        }

        prop.houses += 1;
        await tx
          .update(players)
          .set({ money: freshPlayer.money - cost })
          .where(eq(players.id, currentPlayer.id));

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "build-house"
        );
        if (!updated) return staleStateResponse(room.stateVersion);

        const buildingType = prop.houses === 5 ? "a Hotel" : `House #${prop.houses}`;
        await addLog(
          tx,
          roomId,
          actingPlayerId,
          `${currentPlayer.name} built ${buildingType} on ${space.name} for $${cost}! 🏗️`
        );
        return NextResponse.json({ success: true });
      }

      if (action === "mortgage") {
        const propertyIndex = spaceIndex as number;
        const prop = gameState.properties.find(
          (entry) =>
            entry.spaceIndex === propertyIndex && entry.ownerId === actingPlayerId
        );
        if (!prop) {
          return NextResponse.json(
            { error: "You don't own this property" },
            { status: 400 }
          );
        }
        if (prop.isMortgaged) {
          return NextResponse.json(
            { error: "Already mortgaged" },
            { status: 400 }
          );
        }
        if (prop.houses > 0) {
          return NextResponse.json(
            { error: "Sell houses first" },
            { status: 400 }
          );
        }

        const space = BOARD_SPACES[propertyIndex];
        const mortgageValue = space.mortgageValue || 0;
        const [freshPlayer] = await tx
          .select()
          .from(players)
          .where(eq(players.id, currentPlayer.id));

        prop.isMortgaged = true;
        await tx
          .update(players)
          .set({ money: freshPlayer.money + mortgageValue })
          .where(eq(players.id, currentPlayer.id));

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "mortgage"
        );
        if (!updated) return staleStateResponse(room.stateVersion);

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          `${currentPlayer.name} mortgaged ${space.name} for $${mortgageValue}.`
        );
        return NextResponse.json({ success: true });
      }

      if (action === "unmortgage") {
        const propertyIndex = spaceIndex as number;
        const prop = gameState.properties.find(
          (entry) =>
            entry.spaceIndex === propertyIndex && entry.ownerId === actingPlayerId
        );
        if (!prop) {
          return NextResponse.json(
            { error: "You don't own this property" },
            { status: 400 }
          );
        }
        if (!prop.isMortgaged) {
          return NextResponse.json(
            { error: "Not mortgaged" },
            { status: 400 }
          );
        }

        const space = BOARD_SPACES[propertyIndex];
        const unmortgageCost = Math.ceil((space.mortgageValue || 0) * 1.1);
        const [freshPlayer] = await tx
          .select()
          .from(players)
          .where(eq(players.id, currentPlayer.id));
        if (freshPlayer.money < unmortgageCost) {
          return NextResponse.json(
            { error: "Not enough money" },
            { status: 400 }
          );
        }

        prop.isMortgaged = false;
        await tx
          .update(players)
          .set({ money: freshPlayer.money - unmortgageCost })
          .where(eq(players.id, currentPlayer.id));

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "unmortgage"
        );
        if (!updated) return staleStateResponse(room.stateVersion);

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          `${currentPlayer.name} unmortgaged ${space.name} for $${unmortgageCost}.`
        );
        return NextResponse.json({ success: true });
      }

      if (action === "pay-jail-fee") {
        if (currentTurnPlayer.playerId !== actingPlayerId) {
          return NextResponse.json({ error: "Not your turn" }, { status: 400 });
        }
        if (!currentPlayer.inJail) {
          return NextResponse.json(
            { error: "Not in jail" },
            { status: 400 }
          );
        }

        const [freshPlayer] = await tx
          .select()
          .from(players)
          .where(eq(players.id, currentPlayer.id));
        if (freshPlayer.money < 50) {
          return NextResponse.json(
            { error: "Not enough money" },
            { status: 400 }
          );
        }

        await tx
          .update(players)
          .set({ inJail: false, jailTurns: 0, money: freshPlayer.money - 50 })
          .where(eq(players.id, currentPlayer.id));

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "pay-jail-fee"
        );
        if (!updated) return staleStateResponse(room.stateVersion);

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          `${currentPlayer.name} paid $50 to get out of Jail.`
        );
        return NextResponse.json({ success: true });
      }

      if (action === "use-jail-card") {
        if (currentTurnPlayer.playerId !== actingPlayerId) {
          return NextResponse.json({ error: "Not your turn" }, { status: 400 });
        }
        if (!currentPlayer.inJail) {
          return NextResponse.json(
            { error: "Not in jail" },
            { status: 400 }
          );
        }
        if ((currentPlayer.getOutOfJailCards || 0) < 1) {
          return NextResponse.json(
            { error: "No cards available" },
            { status: 400 }
          );
        }

        await tx
          .update(players)
          .set({
            inJail: false,
            jailTurns: 0,
            getOutOfJailCards: (currentPlayer.getOutOfJailCards || 0) - 1,
          })
          .where(eq(players.id, currentPlayer.id));

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "use-jail-card"
        );
        if (!updated) return staleStateResponse(room.stateVersion);

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          `${currentPlayer.name} used a Get Out of Jail Free card! 🎫`
        );
        return NextResponse.json({ success: true });
      }

      if (action === "sell-house") {
        const propertyIndex = spaceIndex as number;
        const prop = gameState.properties.find(
          (entry) =>
            entry.spaceIndex === propertyIndex && entry.ownerId === actingPlayerId
        );
        if (!prop || prop.houses <= 0) {
          return NextResponse.json(
            { error: "No houses to sell" },
            { status: 400 }
          );
        }

        const space = BOARD_SPACES[propertyIndex];
        const sellPrice = Math.floor((space.houseCost || 0) / 2);
        const [freshPlayer] = await tx
          .select()
          .from(players)
          .where(eq(players.id, currentPlayer.id));

        prop.houses -= 1;
        await tx
          .update(players)
          .set({ money: freshPlayer.money + sellPrice })
          .where(eq(players.id, currentPlayer.id));

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "sell-house"
        );
        if (!updated) return staleStateResponse(room.stateVersion);

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          `${currentPlayer.name} sold a house on ${space.name} for $${sellPrice}.`
        );
        return NextResponse.json({ success: true });
      }

      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    });
  } catch (error) {
    console.error("Action error:", error);
    return NextResponse.json(
      { error: "Failed to process action" },
      { status: 500 }
    );
  }
}
