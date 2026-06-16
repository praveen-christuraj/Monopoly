import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rooms, players, gameLog, roomEvents } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  canBuildHouse,
  canMortgageProperty,
  canSellHouse,
  canTradeProperty,
  findNextOpponentOwnedProperty,
  findNextUnownedProperty,
  getSpeedDieValue,
  rollDice,
  rollSpeedDie,
  isDoubles,
  calculateRent,
  getPropertyOwner,
  getNextChanceCard,
  getNextCommunityChestCard,
  countPlayerHouses,
  ownsFullColorGroup,
  normalizeGameState,
  normalizeHouseRules,
  type HouseRules,
  type SpeedDieFace,
  type GameState,
} from "@/lib/game-engine";
import { BOARD_SPACES } from "@/lib/monopoly-data";
import {
  normalizeExpectedStateVersion,
  normalizeSpaceIndex,
} from "@/lib/validation";
import { formatCurrency } from "@/lib/formatters";

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
  "update-house-rules",
  "bid-auction",
  "pass-auction",
  "propose-trade",
  "accept-trade",
  "reject-trade",
  "cancel-trade",
  "choose-speed-die",
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

function sanitizePropertyIndexes(values: unknown): number[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((value): value is number => typeof value === "number" && Number.isInteger(value))
    .filter((value, index, all) => all.indexOf(value) === index);
}

function getTradeSummary(
  trade: {
    fromPlayerId: string;
    toPlayerId: string;
    offerCash: number;
    requestCash: number;
    offeredPropertyIndexes: number[];
    requestedPropertyIndexes: number[];
  },
  allPlayers: Array<{
    playerId: string;
    name: string;
  }>
) {
  const fromPlayer = allPlayers.find((player) => player.playerId === trade.fromPlayerId);
  const toPlayer = allPlayers.find((player) => player.playerId === trade.toPlayerId);

  return {
    type: "trade",
    fromPlayerId: trade.fromPlayerId,
    fromPlayerName: fromPlayer?.name ?? "Unknown player",
    toPlayerId: trade.toPlayerId,
    toPlayerName: toPlayer?.name ?? "Unknown player",
    offerCash: trade.offerCash,
    requestCash: trade.requestCash,
    offeredPropertyIndexes: trade.offeredPropertyIndexes,
    requestedPropertyIndexes: trade.requestedPropertyIndexes,
    offeredPropertyNames: trade.offeredPropertyIndexes.map(
      (spaceIndex) => BOARD_SPACES[spaceIndex]?.name ?? `Space ${spaceIndex}`
    ),
    requestedPropertyNames: trade.requestedPropertyIndexes.map(
      (spaceIndex) => BOARD_SPACES[spaceIndex]?.name ?? `Space ${spaceIndex}`
    ),
  };
}

async function resolveBankruptcy(
  client: DbClient,
  gameState: GameState,
  allPlayers: Array<{
    id: string;
    playerId: string;
    name: string;
    money: number;
    isBankrupt: boolean;
    getOutOfJailCards: number;
  }>,
  bankruptPlayerId: string,
  creditorPlayerId: string | null
): Promise<{
  bankruptName: string;
  creditorName: string | null;
  cashTransferred: number;
  liquidationValue: number;
  mortgageInterestDue: number;
  transferredPropertyCount: number;
  transferredGetOutOfJailCards: number;
}> {
  const bankruptPlayer = allPlayers.find(
    (player) => player.playerId === bankruptPlayerId
  );
  const creditorPlayer = creditorPlayerId
    ? allPlayers.find((player) => player.playerId === creditorPlayerId)
    : null;

  if (!bankruptPlayer) {
    return {
      bankruptName: "Unknown player",
      creditorName: creditorPlayer?.name ?? null,
      cashTransferred: 0,
      liquidationValue: 0,
      mortgageInterestDue: 0,
      transferredPropertyCount: 0,
      transferredGetOutOfJailCards: 0,
    };
  }

  const cashToTransfer = Math.max(0, bankruptPlayer.money);
  let liquidationValue = 0;
  let mortgageInterestDue = 0;
  let transferredPropertyCount = 0;
  const transferredGetOutOfJailCards = bankruptPlayer.getOutOfJailCards || 0;

  if (creditorPlayer && creditorPlayerId) {
    for (const property of gameState.properties) {
      if (property.ownerId === bankruptPlayerId) {
        transferredPropertyCount += 1;
        const space = BOARD_SPACES[property.spaceIndex];
        if (space.type === "property" && property.houses > 0 && space.houseCost) {
          liquidationValue += Math.floor((space.houseCost * property.houses) / 2);
          property.houses = 0;
        }
        if (property.isMortgaged && space.mortgageValue) {
          mortgageInterestDue += Math.ceil(space.mortgageValue * 0.1);
        }
        property.ownerId = creditorPlayerId;
      }
    }

    await client
      .update(players)
      .set({
        money: Math.max(
          0,
          creditorPlayer.money + cashToTransfer + liquidationValue - mortgageInterestDue
        ),
        getOutOfJailCards:
          (creditorPlayer.getOutOfJailCards || 0) +
          (bankruptPlayer.getOutOfJailCards || 0),
      })
      .where(eq(players.id, creditorPlayer.id));
  } else {
    transferredPropertyCount = gameState.properties.filter(
      (property) => property.ownerId === bankruptPlayerId
    ).length;
    gameState.properties = gameState.properties.filter(
      (property) => property.ownerId !== bankruptPlayerId
    );
  }

  await client
    .update(players)
    .set({
      money: 0,
      isBankrupt: true,
      isActive: false,
      getOutOfJailCards: 0,
    })
    .where(eq(players.id, bankruptPlayer.id));

  return {
    bankruptName: bankruptPlayer.name,
    creditorName: creditorPlayer?.name ?? null,
    cashTransferred: cashToTransfer,
    liquidationValue,
    mortgageInterestDue,
    transferredPropertyCount,
    transferredGetOutOfJailCards,
  };
}

function unlockSpeedDieForPlayer(gameState: GameState, playerId: string) {
  if (!gameState.speedDieUnlockedPlayerIds.includes(playerId)) {
    gameState.speedDieUnlockedPlayerIds.push(playerId);
  }
}

function isSpeedDieUnlockedForPlayer(gameState: GameState, playerId: string) {
  return gameState.speedDieUnlockedPlayerIds.includes(playerId);
}

function getActiveSpeedDieFace(
  gameState: GameState,
  playerId: string,
  inJail: boolean,
  activePlayerCount: number
): SpeedDieFace | null {
  if (
    !gameState.houseRules.speedDieEnabled ||
    inJail ||
    activePlayerCount < 3 ||
    !isSpeedDieUnlockedForPlayer(gameState, playerId)
  ) {
    return null;
  }

  return rollSpeedDie();
}

function getWhiteDiceTotal(gameState: GameState) {
  return (gameState.lastDice?.[0] || 0) + (gameState.lastDice?.[1] || 0);
}

function findNextSpaceIndex(startIndex: number, candidates: number[]) {
  for (const candidate of candidates) {
    if (candidate > startIndex) {
      return candidate;
    }
  }

  return candidates[0] ?? 0;
}

async function applyMrMonopolyBonus(
  client: DbClient,
  roomId: string,
  actingPlayerId: string,
  currentPlayer: {
    id: string;
    playerId: string;
    name: string;
    position: number;
    money: number;
    getOutOfJailCards: number;
  },
  allPlayers: Array<{
    id: string;
    playerId: string;
    name: string;
    money: number;
    isBankrupt: boolean;
  }>,
  gameState: GameState
) {
  const [freshPlayer] = await client
    .select()
    .from(players)
    .where(eq(players.id, currentPlayer.id));
  const nextUnowned = findNextUnownedProperty(gameState, freshPlayer.position);
  const passedGoToUnowned = nextUnowned !== null && nextUnowned < freshPlayer.position;
  const unownedGoSalary =
    nextUnowned === null
      ? 0
      : passedGoToUnowned || nextUnowned === 0
      ? nextUnowned === 0 && gameState.houseRules.doubleSalaryOnGo
        ? 400
        : 200
      : 0;

  if (nextUnowned !== null) {
    await client
      .update(players)
      .set({ position: nextUnowned, money: freshPlayer.money + unownedGoSalary })
      .where(eq(players.id, freshPlayer.id));

    gameState.phase = "buy-decision";
    gameState.pendingSpeedDie = null;

    if (unownedGoSalary > 0) {
      await addLog(
        client,
        roomId,
        actingPlayerId,
        `${currentPlayer.name} passed GO during the Mr. Monopoly bonus and collected ${formatCurrency(unownedGoSalary)}.`,
        {
          type: "go-salary",
          amount: unownedGoSalary,
        }
      );
    }

    await addLog(
      client,
      roomId,
      actingPlayerId,
      `${currentPlayer.name} uses Mr. Monopoly to jump to ${BOARD_SPACES[nextUnowned].name}.`,
      {
        type: "mr-monopoly",
        destinationSpaceIndex: nextUnowned,
        goSalary: unownedGoSalary,
      }
    );
    return;
  }

  const nextOwned = findNextOpponentOwnedProperty(
    gameState,
    freshPlayer.position,
    actingPlayerId
  );
  if (nextOwned === null) {
    gameState.pendingSpeedDie = null;
    await addLog(
      client,
      roomId,
      actingPlayerId,
      `${currentPlayer.name} rolled Mr. Monopoly, but there was no available property bonus.`,
      { type: "mr-monopoly", destinationSpaceIndex: null }
    );
    return;
  }

  const ownerState = getPropertyOwner(gameState, nextOwned);
  const owner = ownerState
    ? allPlayers.find((entry) => entry.playerId === ownerState.ownerId)
    : null;
  const passedGo = nextOwned < freshPlayer.position && nextOwned !== 0;
  const goSalary =
    passedGo || nextOwned === 0
      ? nextOwned === 0 && gameState.houseRules.doubleSalaryOnGo
        ? 400
        : 200
      : 0;
  const rentAmount = calculateRent(
    gameState,
    nextOwned,
    actingPlayerId,
    (gameState.lastDice?.[0] || 0) +
      (gameState.lastDice?.[1] || 0) +
      getSpeedDieValue(gameState.lastSpeedDie)
  );
  const availableMoney = freshPlayer.money + goSalary;

  if (availableMoney < rentAmount) {
    if (goSalary > 0) {
      await client
        .update(players)
        .set({ money: availableMoney })
        .where(eq(players.id, freshPlayer.id));
      await addLog(
        client,
        roomId,
        actingPlayerId,
        `${currentPlayer.name} passed GO during the Mr. Monopoly bonus and collected ${formatCurrency(goSalary)}.`,
        {
          type: "go-salary",
          amount: goSalary,
        }
      );
    }

    const bankruptcy = await resolveBankruptcy(
      client,
      gameState,
      allPlayers.map((entry) => ({
        ...entry,
        getOutOfJailCards: 0,
      })),
      actingPlayerId,
      ownerState?.ownerId ?? null
    );
    gameState.phase = "end-turn";
    gameState.pendingSpeedDie = null;
    await addLog(
      client,
      roomId,
      actingPlayerId,
      `${bankruptcy.bankruptName} went bankrupt after the Mr. Monopoly bonus move to ${BOARD_SPACES[nextOwned].name}.`,
      {
        type: "mr-monopoly",
        destinationSpaceIndex: nextOwned,
        bankruptcy: true,
        cashTransferred: bankruptcy.cashTransferred,
        liquidationValue: bankruptcy.liquidationValue,
        mortgageInterestDue: bankruptcy.mortgageInterestDue,
        transferredPropertyCount: bankruptcy.transferredPropertyCount,
      }
    );
    return;
  }

  await client
    .update(players)
    .set({ position: nextOwned, money: availableMoney - rentAmount })
    .where(eq(players.id, freshPlayer.id));

  if (owner) {
    await client
      .update(players)
      .set({ money: owner.money + rentAmount })
      .where(eq(players.id, owner.id));
  }

  gameState.phase = "end-turn";
  gameState.pendingSpeedDie = null;

  await addLog(
    client,
    roomId,
    actingPlayerId,
    `${currentPlayer.name} uses Mr. Monopoly to move to ${BOARD_SPACES[nextOwned].name} and pays ${formatCurrency(rentAmount)} to ${owner?.name}.`,
    {
      type: "mr-monopoly",
      destinationSpaceIndex: nextOwned,
      rentAmount,
      goSalary,
    }
  );
}

async function resolveLanding(
  client: DbClient,
  roomId: string,
  actingPlayerId: string,
  currentPlayer: {
    id: string;
    playerId: string;
    name: string;
    position: number;
    money: number;
    getOutOfJailCards: number;
  },
  allPlayers: Array<{
    id: string;
    playerId: string;
    name: string;
    money: number;
    isBankrupt: boolean;
    getOutOfJailCards: number;
  }>,
  gameState: GameState,
  newPos: number,
  diceTotalForRent: number,
  canRollAgain: boolean,
  nextDoublesCount?: number,
  movementMode: "track" | "direct" = "track",
  forcedRentAmount?: number | null
) {
  const oldPos = currentPlayer.position;
  const passedGo =
    movementMode === "track" ? newPos < oldPos && newPos !== 0 : false;
  let moneyChange = 0;

  if (passedGo || newPos === 0) {
    const goSalary =
      newPos === 0 && gameState.houseRules.doubleSalaryOnGo ? 400 : 200;
    moneyChange += goSalary;
    unlockSpeedDieForPlayer(gameState, actingPlayerId);
    await addLog(
      client,
      roomId,
      actingPlayerId,
      `${currentPlayer.name} passed GO and collected ${formatCurrency(goSalary)}! 💰`,
      {
        type: "go-salary",
        amount: goSalary,
        directMove: movementMode === "direct",
      }
    );
  }

  const space = BOARD_SPACES[newPos];
  if (space.type === "go-to-jail") {
    await client
      .update(players)
      .set({
        position: 10,
        inJail: true,
        jailTurns: 0,
        money: currentPlayer.money + moneyChange,
        doublesCount: 0,
      })
      .where(eq(players.id, currentPlayer.id));
    gameState.phase = "end-turn";
    gameState.pendingSpeedDie = null;
    await addLog(client, roomId, actingPlayerId, `${currentPlayer.name} goes to Jail! 🚔`);
    return;
  }

  if (space.type === "tax") {
    moneyChange -= space.taxAmount || 0;
    if (gameState.houseRules.freeParkingJackpot) {
      gameState.freeParking += space.taxAmount || 0;
    }
    await addLog(
      client,
      roomId,
      actingPlayerId,
      `${currentPlayer.name} pays ${formatCurrency(space.taxAmount || 0)} tax.`,
      {
        type: "tax",
        amount: space.taxAmount || 0,
      }
    );
  }

  if (
    gameState.houseRules.freeParkingJackpot &&
    space.type === "free-parking" &&
    gameState.freeParking > 0
  ) {
    moneyChange += gameState.freeParking;
    await addLog(
      client,
      roomId,
      actingPlayerId,
      `${currentPlayer.name} collects ${formatCurrency(gameState.freeParking)} from Free Parking! 🎉`,
      {
        type: "free-parking",
        amount: gameState.freeParking,
      }
    );
    gameState.freeParking = 0;
  }

  const playerMoneyAfterMove = currentPlayer.money + moneyChange;
  if (playerMoneyAfterMove < 0) {
    const bankruptcy = await resolveBankruptcy(
      client,
      gameState,
      allPlayers,
      actingPlayerId,
      null
    );
    gameState.phase = "end-turn";
    gameState.pendingSpeedDie = null;
    await addLog(
      client,
      roomId,
      actingPlayerId,
      `${bankruptcy.bankruptName} went bankrupt paying the bank.`,
      {
        type: "bankruptcy",
        creditor: "bank",
        cashTransferred: bankruptcy.cashTransferred,
        liquidationValue: bankruptcy.liquidationValue,
        mortgageInterestDue: bankruptcy.mortgageInterestDue,
        transferredPropertyCount: bankruptcy.transferredPropertyCount,
        transferredGetOutOfJailCards: bankruptcy.transferredGetOutOfJailCards,
      }
    );
    return;
  }

  const updatePayload: Record<string, number> = {
    position: newPos,
    money: playerMoneyAfterMove,
  };
  if (typeof nextDoublesCount === "number") {
    updatePayload.doublesCount = nextDoublesCount;
  }

  await client
    .update(players)
    .set(updatePayload)
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
      const rentAmount =
        typeof forcedRentAmount === "number"
          ? forcedRentAmount
          : calculateRent(gameState, newPos, actingPlayerId, diceTotalForRent);
      if (rentAmount > 0) {
        const payerNewMoney = playerMoneyAfterMove - rentAmount;
        const owner = allPlayers.find(
          (entry) => entry.playerId === propState.ownerId
        );

        if (payerNewMoney < 0) {
          const bankruptcy = await resolveBankruptcy(
            client,
            gameState,
            allPlayers,
            actingPlayerId,
            propState.ownerId
          );
          gameState.phase = "end-turn";
          gameState.pendingSpeedDie = null;
          await addLog(
            client,
            roomId,
            actingPlayerId,
            `${bankruptcy.bankruptName} went bankrupt paying rent to ${bankruptcy.creditorName}! 💸`,
            {
              type: "bankruptcy",
              creditor: bankruptcy.creditorName,
              cashTransferred: bankruptcy.cashTransferred,
              liquidationValue: bankruptcy.liquidationValue,
              mortgageInterestDue: bankruptcy.mortgageInterestDue,
              transferredPropertyCount: bankruptcy.transferredPropertyCount,
              transferredGetOutOfJailCards:
                bankruptcy.transferredGetOutOfJailCards,
            }
          );
        } else {
          await client
            .update(players)
            .set({ money: payerNewMoney })
            .where(eq(players.id, currentPlayer.id));
          if (owner) {
            await client
              .update(players)
              .set({ money: owner.money + rentAmount })
              .where(eq(players.id, owner.id));
          }
          await addLog(
            client,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} paid ${formatCurrency(rentAmount)} rent to ${owner?.name}.`,
            {
              type: "rent",
              amount: rentAmount,
              creditorPlayerId: owner?.playerId ?? null,
            }
          );
          gameState.phase = canRollAgain ? "roll" : "end-turn";
        }
      } else {
        gameState.phase = canRollAgain ? "roll" : "end-turn";
      }
    } else {
      gameState.phase = canRollAgain ? "roll" : "end-turn";
    }
  } else if (space.type === "chance") {
    const card = getNextChanceCard(gameState);
    gameState.lastCard = card;
    await handleCard(
      client,
      roomId,
      actingPlayerId,
      card,
      {
        ...currentPlayer,
        position: newPos,
        money: playerMoneyAfterMove,
      },
      allPlayers,
      gameState,
      canRollAgain
    );
    await addLog(
      client,
      roomId,
      actingPlayerId,
      `${currentPlayer.name} drew Chance: "${card.text}"`,
      {
        type: "card",
        deck: "chance",
        text: card.text,
      }
    );
  } else if (space.type === "community-chest") {
    const card = getNextCommunityChestCard(gameState);
    gameState.lastCard = card;
    await handleCard(
      client,
      roomId,
      actingPlayerId,
      card,
      {
        ...currentPlayer,
        position: newPos,
        money: playerMoneyAfterMove,
      },
      allPlayers,
      gameState,
      canRollAgain
    );
    await addLog(
      client,
      roomId,
      actingPlayerId,
      `${currentPlayer.name} drew Community Chest: "${card.text}"`,
      {
        type: "card",
        deck: "community-chest",
        text: card.text,
      }
    );
  } else {
    gameState.phase = canRollAgain ? "roll" : "end-turn";
  }

  if (
    gameState.pendingSpeedDie?.type === "mr-monopoly-bonus" &&
    gameState.phase !== "buy-decision"
  ) {
    await applyMrMonopolyBonus(
      client,
      roomId,
      actingPlayerId,
      currentPlayer,
      allPlayers,
      gameState
    );
  }
}

async function handleCard(
  client: DbClient,
  roomId: string,
  actingPlayerId: string,
  card: { text: string; action: string; value?: number; destination?: number },
  player: {
    id: string;
    playerId: string;
    name: string;
    position: number;
    money: number;
    getOutOfJailCards: number;
  },
  allPlayers: Array<{
    id: string;
    playerId: string;
    name: string;
    money: number;
    isBankrupt: boolean;
    getOutOfJailCards: number;
  }>,
  gameState: GameState,
  canRollAgain: boolean
): Promise<void> {
  const [freshPlayer] = await client
    .select()
    .from(players)
    .where(eq(players.id, player.id));

  const latestPlayer = freshPlayer ?? player;
  const cardDiceTotal = getWhiteDiceTotal(gameState);

  switch (card.action) {
    case "move": {
      const dest = card.destination ?? 0;
      await resolveLanding(
        client,
        roomId,
        actingPlayerId,
        latestPlayer,
        allPlayers,
        gameState,
        dest,
        cardDiceTotal,
        canRollAgain,
        0,
        "track"
      );
      return;
    }
    case "collect": {
      await client
        .update(players)
        .set({ money: latestPlayer.money + (card.value || 0) })
        .where(eq(players.id, latestPlayer.id));
      gameState.phase = canRollAgain ? "roll" : "end-turn";
      return;
    }
    case "pay": {
      const newMoney = latestPlayer.money - (card.value || 0);
      if (gameState.houseRules.freeParkingJackpot) {
        gameState.freeParking += card.value || 0;
      }
      if (newMoney < 0) {
        const bankruptcy = await resolveBankruptcy(
          client,
          gameState,
          allPlayers,
          latestPlayer.playerId,
          null
        );
        await addLog(
          client,
          roomId,
          actingPlayerId,
          `${bankruptcy.bankruptName} went bankrupt paying a card fee to the bank.`,
          {
            type: "bankruptcy",
            creditor: "bank",
            cashTransferred: bankruptcy.cashTransferred,
            liquidationValue: bankruptcy.liquidationValue,
            mortgageInterestDue: bankruptcy.mortgageInterestDue,
            transferredPropertyCount: bankruptcy.transferredPropertyCount,
            transferredGetOutOfJailCards:
              bankruptcy.transferredGetOutOfJailCards,
          }
        );
        gameState.phase = "end-turn";
      } else {
        await client
          .update(players)
          .set({ money: newMoney })
          .where(eq(players.id, latestPlayer.id));
        gameState.phase = canRollAgain ? "roll" : "end-turn";
      }
      return;
    }
    case "go-to-jail": {
      await client
        .update(players)
        .set({ position: 10, inJail: true, jailTurns: 0, doublesCount: 0 })
        .where(eq(players.id, latestPlayer.id));
      gameState.phase = "end-turn";
      return;
    }
    case "get-out-of-jail": {
      await client
        .update(players)
        .set({ getOutOfJailCards: (latestPlayer.getOutOfJailCards || 0) + 1 })
        .where(eq(players.id, latestPlayer.id));
      gameState.phase = canRollAgain ? "roll" : "end-turn";
      return;
    }
    case "move-back": {
      const newPos = (latestPlayer.position - (card.value || 3) + 40) % 40;
      await resolveLanding(
        client,
        roomId,
        actingPlayerId,
        latestPlayer,
        allPlayers,
        gameState,
        newPos,
        cardDiceTotal,
        canRollAgain,
        0,
        "direct"
      );
      return;
    }
    case "pay-each": {
      const others = allPlayers.filter(
        (entry) => entry.playerId !== latestPlayer.playerId && !entry.isBankrupt
      );
      const totalPay = others.length * (card.value || 0);
      if (latestPlayer.money < totalPay) {
        const bankruptcy = await resolveBankruptcy(
          client,
          gameState,
          allPlayers,
          latestPlayer.playerId,
          null
        );
        await addLog(
          client,
          roomId,
          actingPlayerId,
          `${bankruptcy.bankruptName} went bankrupt trying to pay every player.`,
          {
            type: "bankruptcy",
            creditor: "bank",
            cashTransferred: bankruptcy.cashTransferred,
            liquidationValue: bankruptcy.liquidationValue,
            mortgageInterestDue: bankruptcy.mortgageInterestDue,
            transferredPropertyCount: bankruptcy.transferredPropertyCount,
            transferredGetOutOfJailCards:
              bankruptcy.transferredGetOutOfJailCards,
          }
        );
        gameState.phase = "end-turn";
        return;
      }
      await client
        .update(players)
        .set({ money: latestPlayer.money - totalPay })
        .where(eq(players.id, latestPlayer.id));
      for (const other of others) {
        await client
          .update(players)
          .set({ money: other.money + (card.value || 0) })
          .where(eq(players.id, other.id));
      }
      gameState.phase = canRollAgain ? "roll" : "end-turn";
      return;
    }
    case "collect-each": {
      const others = allPlayers.filter(
        (entry) => entry.playerId !== latestPlayer.playerId && !entry.isBankrupt
      );
      let totalCollect = 0;
      for (const other of others) {
        const amount = card.value || 0;
        if (other.money < amount) {
          await resolveBankruptcy(
            client,
            gameState,
            allPlayers,
            other.playerId,
            latestPlayer.playerId
          );
          continue;
        }
        await client
          .update(players)
          .set({ money: other.money - amount })
          .where(eq(players.id, other.id));
        totalCollect += amount;
      }
      await client
        .update(players)
        .set({ money: latestPlayer.money + totalCollect })
        .where(eq(players.id, latestPlayer.id));
      gameState.phase = canRollAgain ? "roll" : "end-turn";
      return;
    }
    case "repairs": {
      const { houses, hotels } = countPlayerHouses(gameState, latestPlayer.playerId);
      const cost =
        houses * (card.value || 25) +
        hotels * (card.value === 25 ? 100 : 115);
      if (gameState.houseRules.freeParkingJackpot) {
        gameState.freeParking += cost;
      }
      if (latestPlayer.money < cost) {
        const bankruptcy = await resolveBankruptcy(
          client,
          gameState,
          allPlayers,
          latestPlayer.playerId,
          null
        );
        await addLog(
          client,
          roomId,
          actingPlayerId,
          `${bankruptcy.bankruptName} went bankrupt paying building repair costs.`,
          {
            type: "bankruptcy",
            creditor: "bank",
            cashTransferred: bankruptcy.cashTransferred,
            liquidationValue: bankruptcy.liquidationValue,
            mortgageInterestDue: bankruptcy.mortgageInterestDue,
            transferredPropertyCount: bankruptcy.transferredPropertyCount,
            transferredGetOutOfJailCards:
              bankruptcy.transferredGetOutOfJailCards,
          }
        );
        gameState.phase = "end-turn";
      } else {
        await client
          .update(players)
          .set({ money: latestPlayer.money - cost })
          .where(eq(players.id, latestPlayer.id));
        gameState.phase = canRollAgain ? "roll" : "end-turn";
      }
      return;
    }
    case "nearest-railroad": {
      const nearest = findNextSpaceIndex(latestPlayer.position, [5, 15, 25, 35]);
      const owner = getPropertyOwner(gameState, nearest);
      const baseRent = owner
        ? calculateRent(gameState, nearest, latestPlayer.playerId, cardDiceTotal)
        : 0;
      await resolveLanding(
        client,
        roomId,
        actingPlayerId,
        latestPlayer,
        allPlayers,
        gameState,
        nearest,
        cardDiceTotal,
        canRollAgain,
        0,
        "track",
        owner ? baseRent * 2 : null
      );
      return;
    }
    case "nearest-utility": {
      const nearest = findNextSpaceIndex(latestPlayer.position, [12, 28]);
      const owner = getPropertyOwner(gameState, nearest);
      await resolveLanding(
        client,
        roomId,
        actingPlayerId,
        latestPlayer,
        allPlayers,
        gameState,
        nearest,
        cardDiceTotal,
        canRollAgain,
        0,
        "track",
        owner ? cardDiceTotal * 10 : null
      );
      return;
    }
    default:
      gameState.phase = canRollAgain ? "roll" : "end-turn";
      return;
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
    const bidAmount =
      typeof body?.bidAmount === "number" && Number.isInteger(body.bidAmount)
        ? body.bidAmount
        : null;
    const houseRulesPatch =
      body?.houseRules && typeof body.houseRules === "object"
        ? (body.houseRules as Partial<HouseRules>)
        : null;
    const tradeTargetPlayerId =
      typeof body?.toPlayerId === "string" && body.toPlayerId.trim().length > 0
        ? body.toPlayerId
        : null;
    const offerCash =
      typeof body?.offerCash === "number" && Number.isInteger(body.offerCash)
        ? Math.max(0, body.offerCash)
        : 0;
    const requestCash =
      typeof body?.requestCash === "number" && Number.isInteger(body.requestCash)
        ? Math.max(0, body.requestCash)
        : 0;
    const offeredPropertyIndexes = sanitizePropertyIndexes(body?.offeredPropertyIndexes);
    const requestedPropertyIndexes = sanitizePropertyIndexes(
      body?.requestedPropertyIndexes
    );
    const movementChoice =
      body?.movementChoice === "die1" ||
      body?.movementChoice === "die2" ||
      body?.movementChoice === "total"
        ? body.movementChoice
        : null;

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
      const gameState = normalizeGameState(room.gameState as GameState);

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

        if (gameState.houseRules.quickMode) {
          await tx
            .update(players)
            .set({ money: 1000 })
            .where(eq(players.roomId, roomId));
        }

        gameState.phase = "roll";
        gameState.pendingTrade = null;
        gameState.lastSpeedDie = null;
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

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          gameState.houseRules.quickMode
            ? "Game started in Quick Mode!"
            : "Game started!"
        );
        return NextResponse.json({ success: true });
      }

      if (action === "update-house-rules") {
        if (room.status !== "waiting") {
          return NextResponse.json(
            { error: "House rules can only be changed before the game starts" },
            { status: 400 }
          );
        }
        if (actingPlayerId !== room.hostId) {
          return NextResponse.json(
            { error: "Only the host can change house rules" },
            { status: 403 }
          );
        }
        if (!houseRulesPatch) {
          return NextResponse.json(
            { error: "Missing house rules changes" },
            { status: 400 }
          );
        }

        gameState.houseRules = normalizeHouseRules({
          ...gameState.houseRules,
          ...houseRulesPatch,
        });

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "update-house-rules"
        );
        if (!updated) {
          return staleStateResponse(room.stateVersion);
        }

        await addLog(tx, roomId, actingPlayerId, "House rules updated.");
        return NextResponse.json({ success: true, houseRules: gameState.houseRules });
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

      if (
        action === "propose-trade" ||
        action === "accept-trade" ||
        action === "reject-trade" ||
        action === "cancel-trade"
      ) {
        if (gameState.phase === "auction") {
          return NextResponse.json(
            { error: "Finish the auction before trading" },
            { status: 400 }
          );
        }

        if (action === "propose-trade") {
          if (currentTurnPlayer.playerId !== actingPlayerId) {
            return NextResponse.json(
              { error: "You can only propose trades on your turn" },
              { status: 400 }
            );
          }
          if (gameState.pendingTrade) {
            return NextResponse.json(
              { error: "Resolve the current trade first" },
              { status: 400 }
            );
          }
          if (!tradeTargetPlayerId || tradeTargetPlayerId === actingPlayerId) {
            return NextResponse.json(
              { error: "Choose another player to trade with" },
              { status: 400 }
            );
          }

          const targetPlayer = activePlayers.find(
            (entry) => entry.playerId === tradeTargetPlayerId
          );
          if (!targetPlayer) {
            return NextResponse.json(
              { error: "Selected trade player is unavailable" },
              { status: 400 }
            );
          }
          if (
            offerCash === 0 &&
            requestCash === 0 &&
            offeredPropertyIndexes.length === 0 &&
            requestedPropertyIndexes.length === 0
          ) {
            return NextResponse.json(
              { error: "Trade offer cannot be empty" },
              { status: 400 }
            );
          }
          if (currentPlayer.money < offerCash) {
            return NextResponse.json(
              { error: "You do not have enough cash for that offer" },
              { status: 400 }
            );
          }
          if (targetPlayer.money < requestCash) {
            return NextResponse.json(
              { error: `${targetPlayer.name} does not have enough cash for that trade` },
              { status: 400 }
            );
          }
          if (
            !offeredPropertyIndexes.every((propertyIndex) =>
              canTradeProperty(gameState, actingPlayerId, propertyIndex)
            ) ||
            !requestedPropertyIndexes.every((propertyIndex) =>
              canTradeProperty(gameState, tradeTargetPlayerId, propertyIndex)
            )
          ) {
            return NextResponse.json(
              { error: "Traded properties must be owned outright and have no buildings in their set" },
              { status: 400 }
            );
          }

          gameState.pendingTrade = {
            fromPlayerId: actingPlayerId,
            toPlayerId: tradeTargetPlayerId,
            offerCash,
            requestCash,
            offeredPropertyIndexes,
            requestedPropertyIndexes,
          };
          gameState.pendingAction = gameState.phase;
          gameState.phase = "trade-response";

          const updated = await updateRoomSnapshot(
            tx,
            roomId,
            room.stateVersion,
            { gameState },
            "propose-trade"
          );
          if (!updated) return staleStateResponse(room.stateVersion);

          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} proposed a trade to ${targetPlayer.name}.`,
            {
              ...getTradeSummary(
                {
                  fromPlayerId: actingPlayerId,
                  toPlayerId: tradeTargetPlayerId,
                  offerCash,
                  requestCash,
                  offeredPropertyIndexes,
                  requestedPropertyIndexes,
                },
                allPlayers
              ),
              status: "proposed",
            }
          );
          return NextResponse.json({ success: true });
        }

        const pendingTrade = gameState.pendingTrade;
        if (!pendingTrade) {
          return NextResponse.json(
            { error: "There is no active trade offer" },
            { status: 400 }
          );
        }

        if (action === "cancel-trade") {
          if (pendingTrade.fromPlayerId !== actingPlayerId) {
            return NextResponse.json(
              { error: "Only the proposing player can cancel this trade" },
              { status: 400 }
            );
          }

          gameState.pendingTrade = null;
          gameState.phase = gameState.pendingAction === "roll" ? "roll" : "end-turn";
          gameState.pendingAction = null;

          const updated = await updateRoomSnapshot(
            tx,
            roomId,
            room.stateVersion,
            { gameState },
            "cancel-trade"
          );
          if (!updated) return staleStateResponse(room.stateVersion);

          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} cancelled the trade.`,
            {
              ...getTradeSummary(pendingTrade, allPlayers),
              status: "cancelled",
            }
          );
          return NextResponse.json({ success: true });
        }

        if (pendingTrade.toPlayerId !== actingPlayerId) {
          return NextResponse.json(
            { error: "Only the target player can respond to this trade" },
            { status: 400 }
          );
        }

        const tradeFromPlayer = allPlayers.find(
          (entry) => entry.playerId === pendingTrade.fromPlayerId
        );
        const tradeToPlayer = allPlayers.find(
          (entry) => entry.playerId === pendingTrade.toPlayerId
        );
        if (!tradeFromPlayer || !tradeToPlayer) {
          return NextResponse.json(
            { error: "Trade players are unavailable" },
            { status: 400 }
          );
        }

        if (action === "reject-trade") {
          gameState.pendingTrade = null;
          gameState.phase = gameState.pendingAction === "roll" ? "roll" : "end-turn";
          gameState.pendingAction = null;

          const updated = await updateRoomSnapshot(
            tx,
            roomId,
            room.stateVersion,
            { gameState },
            "reject-trade"
          );
          if (!updated) return staleStateResponse(room.stateVersion);

          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${tradeToPlayer.name} rejected the trade from ${tradeFromPlayer.name}.`,
            {
              ...getTradeSummary(pendingTrade, allPlayers),
              status: "rejected",
            }
          );
          return NextResponse.json({ success: true });
        }

        if (
          tradeFromPlayer.money < pendingTrade.offerCash ||
          tradeToPlayer.money < pendingTrade.requestCash
        ) {
          return NextResponse.json(
            { error: "The trade is no longer affordable" },
            { status: 400 }
          );
        }
        if (
          !pendingTrade.offeredPropertyIndexes.every((propertyIndex) =>
            canTradeProperty(gameState, pendingTrade.fromPlayerId, propertyIndex)
          ) ||
          !pendingTrade.requestedPropertyIndexes.every((propertyIndex) =>
            canTradeProperty(gameState, pendingTrade.toPlayerId, propertyIndex)
          )
        ) {
          return NextResponse.json(
            { error: "One or more properties can no longer be traded" },
            { status: 400 }
          );
        }

        await tx
          .update(players)
          .set({
            money:
              tradeFromPlayer.money -
              pendingTrade.offerCash +
              pendingTrade.requestCash,
          })
          .where(eq(players.id, tradeFromPlayer.id));
        await tx
          .update(players)
          .set({
            money:
              tradeToPlayer.money -
              pendingTrade.requestCash +
              pendingTrade.offerCash,
          })
          .where(eq(players.id, tradeToPlayer.id));

        for (const propertyIndex of pendingTrade.offeredPropertyIndexes) {
          const property = gameState.properties.find(
            (entry) =>
              entry.spaceIndex === propertyIndex &&
              entry.ownerId === pendingTrade.fromPlayerId
          );
          if (property) {
            property.ownerId = pendingTrade.toPlayerId;
          }
        }
        for (const propertyIndex of pendingTrade.requestedPropertyIndexes) {
          const property = gameState.properties.find(
            (entry) =>
              entry.spaceIndex === propertyIndex &&
              entry.ownerId === pendingTrade.toPlayerId
          );
          if (property) {
            property.ownerId = pendingTrade.fromPlayerId;
          }
        }

        gameState.pendingTrade = null;
        gameState.phase = gameState.pendingAction === "roll" ? "roll" : "end-turn";
        gameState.pendingAction = null;

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "accept-trade"
        );
        if (!updated) return staleStateResponse(room.stateVersion);

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          `${tradeToPlayer.name} accepted a trade with ${tradeFromPlayer.name}.`,
          {
            ...getTradeSummary(pendingTrade, allPlayers),
            status: "accepted",
          }
        );
        return NextResponse.json({ success: true });
      }

      if (action === "choose-speed-die") {
        if (currentTurnPlayer.playerId !== actingPlayerId) {
          return NextResponse.json({ error: "Not your turn" }, { status: 400 });
        }
        if (gameState.phase !== "speed-die-choice" || !gameState.pendingSpeedDie) {
          return NextResponse.json(
            { error: "There is no active Speed Die choice" },
            { status: 400 }
          );
        }

        const [die1, die2] = gameState.pendingSpeedDie.whiteDice;
        if (gameState.pendingSpeedDie.type === "bus-choice") {
          if (!movementChoice) {
            return NextResponse.json(
              { error: "Choose how far to move with the Bus" },
              { status: 400 }
            );
          }

          const chosenMove =
            movementChoice === "die1"
              ? die1
              : movementChoice === "die2"
              ? die2
              : die1 + die2;
          const doubles = isDoubles([die1, die2]);

          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} used the Speed Die bus to move ${chosenMove} spaces.`,
            {
              type: "speed-die",
              face: "bus",
              choice: movementChoice,
              move: chosenMove,
            }
          );

          gameState.pendingSpeedDie = null;
          gameState.lastSpeedDie = "bus";

          await resolveLanding(
            tx,
            roomId,
            actingPlayerId,
            currentPlayer,
            allPlayers,
            gameState,
            (currentPlayer.position + chosenMove) % 40,
            die1 + die2,
            doubles,
            doubles ? (currentPlayer.doublesCount || 0) + 1 : 0
          );

          const updated = await updateRoomSnapshot(
            tx,
            roomId,
            room.stateVersion,
            { gameState },
            "choose-speed-die"
          );
          if (!updated) return staleStateResponse(room.stateVersion);
          return NextResponse.json({ success: true });
        }

        if (gameState.pendingSpeedDie.type === "triple-choice") {
          if (spaceIndex === null) {
            return NextResponse.json(
              { error: "Choose any board space for the triple move" },
              { status: 400 }
            );
          }

          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} rolled triples and chose ${BOARD_SPACES[spaceIndex].name}.`,
            {
              type: "speed-die",
              face: gameState.lastSpeedDie,
              choice: "triple",
              destinationSpaceIndex: spaceIndex,
            }
          );

          gameState.pendingSpeedDie = null;

          await resolveLanding(
            tx,
            roomId,
            actingPlayerId,
            currentPlayer,
            allPlayers,
            gameState,
            spaceIndex,
            die1 + die2 + getSpeedDieValue(gameState.lastSpeedDie),
            false,
            0,
            "direct"
          );

          const updated = await updateRoomSnapshot(
            tx,
            roomId,
            room.stateVersion,
            { gameState },
            "choose-speed-die"
          );
          if (!updated) return staleStateResponse(room.stateVersion);
          return NextResponse.json({ success: true });
        }
      }

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
        const [die1, die2] = dice;
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
          gameState.pendingSpeedDie = null;
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
          gameState.lastSpeedDie = null;
          gameState.pendingSpeedDie = null;

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
              if (currentPlayer.money < 50) {
                const bankruptcy = await resolveBankruptcy(
                  tx,
                  gameState,
                  allPlayers,
                  actingPlayerId,
                  null
                );
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
                  `${bankruptcy.bankruptName} could not pay the jail release fee and went bankrupt to the bank.`,
                  {
                    type: "bankruptcy",
                    creditor: "bank",
                    cashTransferred: bankruptcy.cashTransferred,
                    liquidationValue: bankruptcy.liquidationValue,
                    mortgageInterestDue: bankruptcy.mortgageInterestDue,
                    transferredPropertyCount: bankruptcy.transferredPropertyCount,
                    transferredGetOutOfJailCards:
                      bankruptcy.transferredGetOutOfJailCards,
                  }
                );
                return NextResponse.json({ success: true, dice });
              }

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
                `${currentPlayer.name} paid ${formatCurrency(50)} to get out of Jail after 3 turns.`
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
                `${currentPlayer.name} rolled ${die1}+${die2} but stays in Jail (turn ${newJailTurns}/3).`
              );
              return NextResponse.json({ success: true, dice });
            }
          }
        }

        const speedDie = getActiveSpeedDieFace(
          gameState,
          actingPlayerId,
          currentPlayer.inJail,
          activePlayers.length
        );
        gameState.lastSpeedDie = speedDie;
        gameState.pendingSpeedDie = null;

        if (
          speedDie !== null &&
          speedDie !== "bus" &&
          speedDie !== "mr-monopoly" &&
          die1 === die2 &&
          die1 === speedDie
        ) {
          gameState.phase = "speed-die-choice";
          gameState.pendingSpeedDie = {
            type: "triple-choice",
            whiteDice: dice,
          };
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
            `${currentPlayer.name} rolled triples and can move to any board space.`,
            {
              type: "speed-die",
              face: speedDie,
              choice: "triple-pending",
            }
          );
          return NextResponse.json({ success: true, dice, speedDie });
        }

        if (speedDie === "bus") {
          gameState.phase = "speed-die-choice";
          gameState.pendingSpeedDie = {
            type: "bus-choice",
            whiteDice: dice,
          };
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
            `${currentPlayer.name} rolled the Speed Die bus and must choose their move.`,
            {
              type: "speed-die",
              face: "bus",
              options: [die1, die2, die1 + die2],
            }
          );
          return NextResponse.json({ success: true, dice, speedDie });
        }

        const total = die1 + die2 + getSpeedDieValue(speedDie);
        if (speedDie === "mr-monopoly") {
          gameState.pendingSpeedDie = {
            type: "mr-monopoly-bonus",
            whiteDice: dice,
          };
        }

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          speedDie
            ? `${currentPlayer.name} rolled ${die1}+${die2} with Speed Die ${speedDie}.`
            : `${currentPlayer.name} rolled ${die1}+${die2}.`,
          {
            type: "roll",
            dice: [die1, die2],
            speedDie,
          }
        );

        await resolveLanding(
          tx,
          roomId,
          actingPlayerId,
          currentPlayer,
          allPlayers,
          gameState,
          (currentPlayer.position + total) % 40,
          die1 + die2 + getSpeedDieValue(speedDie),
          doubles,
          newDoublesCount
        );

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "roll-dice"
        );
        if (!updated) return staleStateResponse(room.stateVersion);
        return NextResponse.json({ success: true, dice, speedDie });
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
        gameState.pendingAuction = null;
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
          `${currentPlayer.name} bought ${space.name} for ${formatCurrency(space.price)}! 🏠`
        );
        return NextResponse.json({ success: true });
      }

      if (action === "skip-buy") {
        if (currentTurnPlayer.playerId !== actingPlayerId) {
          return NextResponse.json({ error: "Not your turn" }, { status: 400 });
        }

        const skippedSpace = BOARD_SPACES[currentPlayer.position];
        const doubles = gameState.lastDice ? isDoubles(gameState.lastDice) : false;
        if (gameState.houseRules.auctionsEnabled && skippedSpace.price) {
          gameState.phase = "auction";
          gameState.pendingAuction = {
            spaceIndex: currentPlayer.position,
            starterPlayerId: actingPlayerId,
            currentBid: 0,
            currentLeaderPlayerId: null,
            passedPlayerIds: [],
          };
        } else {
          gameState.phase = doubles ? "roll" : "end-turn";
          gameState.pendingAuction = null;
        }
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
        if (gameState.phase === "auction") {
          await addLog(
            tx,
            roomId,
            null,
            `Auction started for ${skippedSpace.name}.`
          );
        }
        return NextResponse.json({ success: true });
      }

      if (action === "bid-auction" || action === "pass-auction") {
        if (gameState.phase !== "auction" || !gameState.pendingAuction) {
          return NextResponse.json(
            { error: "There is no active auction" },
            { status: 400 }
          );
        }

        const auction = gameState.pendingAuction;
        const isActiveAuctionPlayer = activePlayers.some(
          (entry) => entry.playerId === actingPlayerId
        );
        if (!isActiveAuctionPlayer) {
          return NextResponse.json(
            { error: "Only active players can join the auction" },
            { status: 400 }
          );
        }
        if (auction.passedPlayerIds.includes(actingPlayerId)) {
          return NextResponse.json(
            { error: "You already passed on this auction" },
            { status: 400 }
          );
        }

        const auctionSpace = BOARD_SPACES[auction.spaceIndex];
        const doubles = gameState.lastDice ? isDoubles(gameState.lastDice) : false;

        if (action === "bid-auction") {
          if (!auctionSpace?.price) {
            return NextResponse.json(
              { error: "This space cannot be auctioned" },
              { status: 400 }
            );
          }
          if (bidAmount === null || bidAmount <= auction.currentBid) {
            return NextResponse.json(
              { error: "Bid must be higher than the current bid" },
              { status: 400 }
            );
          }

          const [freshBidder] = await tx
            .select()
            .from(players)
            .where(eq(players.id, currentPlayer.id));
          if (freshBidder.money < bidAmount) {
            return NextResponse.json(
              { error: "Not enough money for that bid" },
              { status: 400 }
            );
          }

          auction.currentBid = bidAmount;
          auction.currentLeaderPlayerId = actingPlayerId;

          const updated = await updateRoomSnapshot(
            tx,
            roomId,
            room.stateVersion,
            { gameState },
            "bid-auction"
          );
          if (!updated) return staleStateResponse(room.stateVersion);

          await addLog(
            tx,
            roomId,
            actingPlayerId,
            `${currentPlayer.name} bid ${formatCurrency(bidAmount)} for ${auctionSpace.name}.`
          );
          return NextResponse.json({ success: true });
        }

        if (auction.currentLeaderPlayerId === actingPlayerId) {
          return NextResponse.json(
            { error: "Leading bidder cannot pass right now" },
            { status: 400 }
          );
        }

        auction.passedPlayerIds.push(actingPlayerId);
        const remainingPlayers = activePlayers.filter(
          (entry) => !auction.passedPlayerIds.includes(entry.playerId)
        );

        if (
          auction.currentLeaderPlayerId &&
          remainingPlayers.length === 1 &&
          remainingPlayers[0].playerId === auction.currentLeaderPlayerId
        ) {
          const winningPlayer = activePlayers.find(
            (entry) => entry.playerId === auction.currentLeaderPlayerId
          );
          if (!winningPlayer) {
            return NextResponse.json(
              { error: "Winning bidder could not be found" },
              { status: 400 }
            );
          }

          const [freshWinner] = await tx
            .select()
            .from(players)
            .where(eq(players.id, winningPlayer.id));
          if (freshWinner.money < auction.currentBid) {
            return NextResponse.json(
              { error: "Winning bidder no longer has enough money" },
              { status: 400 }
            );
          }

          await tx
            .update(players)
            .set({ money: freshWinner.money - auction.currentBid })
            .where(eq(players.id, freshWinner.id));

          gameState.properties.push({
            spaceIndex: auction.spaceIndex,
            ownerId: winningPlayer.playerId,
            houses: 0,
            isMortgaged: false,
          });
          gameState.pendingAuction = null;
          gameState.phase = doubles ? "roll" : "end-turn";

          const updated = await updateRoomSnapshot(
            tx,
            roomId,
            room.stateVersion,
            { gameState },
            "pass-auction"
          );
          if (!updated) return staleStateResponse(room.stateVersion);

          await addLog(
            tx,
            roomId,
            winningPlayer.playerId,
            `${winningPlayer.name} won the auction for ${auctionSpace.name} at ${formatCurrency(auction.currentBid)}.`
          );
          return NextResponse.json({ success: true });
        }

        if (!auction.currentLeaderPlayerId && remainingPlayers.length === 0) {
          gameState.pendingAuction = null;
          gameState.phase = doubles ? "roll" : "end-turn";

          const updated = await updateRoomSnapshot(
            tx,
            roomId,
            room.stateVersion,
            { gameState },
            "pass-auction"
          );
          if (!updated) return staleStateResponse(room.stateVersion);

          await addLog(
            tx,
            roomId,
            null,
            `Auction ended with no bids for ${auctionSpace.name}.`
          );
          return NextResponse.json({ success: true });
        }

        const updated = await updateRoomSnapshot(
          tx,
          roomId,
          room.stateVersion,
          { gameState },
          "pass-auction"
        );
        if (!updated) return staleStateResponse(room.stateVersion);

        await addLog(
          tx,
          roomId,
          actingPlayerId,
          `${currentPlayer.name} passed on the auction for ${auctionSpace.name}.`
        );
        return NextResponse.json({ success: true });
      }

      if (action === "end-turn") {
        if (currentTurnPlayer.playerId !== actingPlayerId) {
          return NextResponse.json({ error: "Not your turn" }, { status: 400 });
        }
        if (gameState.phase === "auction") {
          return NextResponse.json(
            { error: "Resolve the auction before ending your turn" },
            { status: 400 }
          );
        }
        if (gameState.pendingTrade) {
          return NextResponse.json(
            { error: "Resolve the active trade before ending your turn" },
            { status: 400 }
          );
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
        gameState.lastSpeedDie = null;
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
        if (!canBuildHouse(gameState, actingPlayerId, propertyIndex)) {
          return NextResponse.json(
            { error: "Build evenly across the full color group first" },
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
          `${currentPlayer.name} built ${buildingType} on ${space.name} for ${formatCurrency(cost)}! 🏗️`
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
        if (!canMortgageProperty(gameState, actingPlayerId, propertyIndex)) {
          return NextResponse.json(
            { error: "Sell all buildings in this color group before mortgaging" },
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
          `${currentPlayer.name} mortgaged ${space.name} for ${formatCurrency(mortgageValue)}.`
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
          `${currentPlayer.name} unmortgaged ${space.name} for ${formatCurrency(unmortgageCost)}.`
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
          `${currentPlayer.name} paid ${formatCurrency(50)} to get out of Jail.`
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
        if (!canSellHouse(gameState, actingPlayerId, propertyIndex)) {
          return NextResponse.json(
            { error: "Sell evenly from the most developed property first" },
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
          `${currentPlayer.name} sold a house on ${space.name} for ${formatCurrency(sellPrice)}.`
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
