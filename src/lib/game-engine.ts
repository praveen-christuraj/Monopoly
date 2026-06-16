import {
  BOARD_SPACES,
  COLOR_GROUPS,
  CHANCE_CARDS,
  COMMUNITY_CHEST_CARDS,
  type GameCard,
} from "./monopoly-data";

export interface PropertyState {
  spaceIndex: number;
  ownerId: string;
  houses: number; // 0-4 houses, 5 = hotel
  isMortgaged: boolean;
}

export interface HouseRules {
  auctionsEnabled: boolean;
  freeParkingJackpot: boolean;
  doubleSalaryOnGo: boolean;
  quickMode: boolean;
  speedDieEnabled: boolean;
}

export interface PendingAuctionState {
  spaceIndex: number;
  starterPlayerId: string;
  currentBid: number;
  currentLeaderPlayerId: string | null;
  passedPlayerIds: string[];
}

export interface PendingTradeState {
  fromPlayerId: string;
  toPlayerId: string;
  offerCash: number;
  requestCash: number;
  offeredPropertyIndexes: number[];
  requestedPropertyIndexes: number[];
}

export type SpeedDieFace = 1 | 2 | 3 | "bus" | "mr-monopoly";

export interface PendingSpeedDieState {
  type: "bus-choice" | "triple-choice" | "mr-monopoly-bonus";
  whiteDice: [number, number];
}

export const DEFAULT_HOUSE_RULES: HouseRules = {
  auctionsEnabled: true,
  freeParkingJackpot: false,
  doubleSalaryOnGo: false,
  quickMode: false,
  speedDieEnabled: false,
};

export interface GameState {
  properties: PropertyState[];
  chanceIndex: number;
  communityIndex: number;
  freeParking: number;
  lastDice: [number, number] | null;
  lastSpeedDie: SpeedDieFace | null;
  lastCard: GameCard | null;
  phase:
    | "roll"
    | "post-roll"
    | "buy-decision"
    | "action"
    | "auction"
    | "speed-die-choice"
    | "trade-response"
    | "end-turn"
    | "game-over";
  pendingAction: string | null;
  pendingAuction: PendingAuctionState | null;
  pendingTrade: PendingTradeState | null;
  pendingSpeedDie: PendingSpeedDieState | null;
  speedDieUnlockedPlayerIds: string[];
  houseRules: HouseRules;
  winnerId: string | null;
  turnCount: number;
}

export function normalizeHouseRules(
  input?: Partial<HouseRules> | null
): HouseRules {
  return {
    auctionsEnabled:
      typeof input?.auctionsEnabled === "boolean"
        ? input.auctionsEnabled
        : DEFAULT_HOUSE_RULES.auctionsEnabled,
    freeParkingJackpot:
      typeof input?.freeParkingJackpot === "boolean"
        ? input.freeParkingJackpot
        : DEFAULT_HOUSE_RULES.freeParkingJackpot,
    doubleSalaryOnGo:
      typeof input?.doubleSalaryOnGo === "boolean"
        ? input.doubleSalaryOnGo
        : DEFAULT_HOUSE_RULES.doubleSalaryOnGo,
    quickMode:
      typeof input?.quickMode === "boolean"
        ? input.quickMode
        : DEFAULT_HOUSE_RULES.quickMode,
    speedDieEnabled:
      typeof input?.speedDieEnabled === "boolean"
        ? input.speedDieEnabled
        : DEFAULT_HOUSE_RULES.speedDieEnabled,
  };
}

export function createInitialGameState(
  houseRules?: Partial<HouseRules>
): GameState {
  return {
    properties: [],
    chanceIndex: 0,
    communityIndex: 0,
    freeParking: 0,
    lastDice: null,
    lastSpeedDie: null,
    lastCard: null,
    phase: "roll",
    pendingAction: null,
    pendingAuction: null,
    pendingTrade: null,
    pendingSpeedDie: null,
    speedDieUnlockedPlayerIds: [],
    houseRules: normalizeHouseRules(houseRules),
    winnerId: null,
    turnCount: 0,
  };
}

export function normalizeGameState(
  input?: Partial<GameState> | null
): GameState {
  if (!input) {
    return createInitialGameState();
  }

  return {
    properties: Array.isArray(input.properties) ? input.properties : [],
    chanceIndex: input.chanceIndex ?? 0,
    communityIndex: input.communityIndex ?? 0,
    freeParking: input.freeParking ?? 0,
    lastDice: input.lastDice ?? null,
    lastSpeedDie:
      input.lastSpeedDie === 1 ||
      input.lastSpeedDie === 2 ||
      input.lastSpeedDie === 3 ||
      input.lastSpeedDie === "bus" ||
      input.lastSpeedDie === "mr-monopoly"
        ? input.lastSpeedDie
        : null,
    lastCard: input.lastCard ?? null,
    phase: input.phase ?? "roll",
    pendingAction: input.pendingAction ?? null,
    pendingAuction: input.pendingAuction
      ? {
          spaceIndex: input.pendingAuction.spaceIndex,
          starterPlayerId: input.pendingAuction.starterPlayerId,
          currentBid: input.pendingAuction.currentBid,
          currentLeaderPlayerId: input.pendingAuction.currentLeaderPlayerId,
          passedPlayerIds: Array.isArray(input.pendingAuction.passedPlayerIds)
            ? input.pendingAuction.passedPlayerIds
            : [],
        }
      : null,
    pendingTrade: input.pendingTrade
      ? {
          fromPlayerId: input.pendingTrade.fromPlayerId,
          toPlayerId: input.pendingTrade.toPlayerId,
          offerCash: input.pendingTrade.offerCash ?? 0,
          requestCash: input.pendingTrade.requestCash ?? 0,
          offeredPropertyIndexes: Array.isArray(input.pendingTrade.offeredPropertyIndexes)
            ? input.pendingTrade.offeredPropertyIndexes
            : [],
          requestedPropertyIndexes: Array.isArray(input.pendingTrade.requestedPropertyIndexes)
            ? input.pendingTrade.requestedPropertyIndexes
            : [],
        }
      : null,
    pendingSpeedDie: input.pendingSpeedDie
      ? {
          type: input.pendingSpeedDie.type,
          whiteDice: input.pendingSpeedDie.whiteDice,
        }
      : null,
    speedDieUnlockedPlayerIds: Array.isArray(input.speedDieUnlockedPlayerIds)
      ? input.speedDieUnlockedPlayerIds.filter(
          (value): value is string => typeof value === "string"
        )
      : [],
    houseRules: normalizeHouseRules(input.houseRules),
    winnerId: input.winnerId ?? null,
    turnCount: input.turnCount ?? 0,
  };
}

export function rollDice(): [number, number] {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  return [d1, d2];
}

export function rollSpeedDie(): SpeedDieFace {
  const faces: SpeedDieFace[] = [1, 2, 3, "bus", "mr-monopoly", "mr-monopoly"];
  return faces[Math.floor(Math.random() * faces.length)];
}

export function isDoubles(dice: [number, number]): boolean {
  return dice[0] === dice[1];
}

export function getPropertyOwner(
  gameState: GameState,
  spaceIndex: number
): PropertyState | undefined {
  return gameState.properties.find((p) => p.spaceIndex === spaceIndex);
}

export function ownsFullColorGroup(
  gameState: GameState,
  playerId: string,
  colorGroup: string
): boolean {
  const groupSpaces = COLOR_GROUPS[colorGroup];
  if (!groupSpaces) return false;
  return groupSpaces.every((si) => {
    const prop = gameState.properties.find((p) => p.spaceIndex === si);
    return prop && prop.ownerId === playerId && !prop.isMortgaged;
  });
}

export function calculateRent(
  gameState: GameState,
  spaceIndex: number,
  playerId: string,
  diceTotal: number
): number {
  const space = BOARD_SPACES[spaceIndex];
  const prop = getPropertyOwner(gameState, spaceIndex);
  if (!prop || prop.ownerId === playerId || prop.isMortgaged) return 0;

  if (space.type === "railroad") {
    const rrCount = [5, 15, 25, 35].filter((si) => {
      const p = gameState.properties.find((x) => x.spaceIndex === si);
      return p && p.ownerId === prop.ownerId && !p.isMortgaged;
    }).length;
    return space.rent ? space.rent[rrCount - 1] : 0;
  }

  if (space.type === "utility") {
    const utilCount = [12, 28].filter((si) => {
      const p = gameState.properties.find((x) => x.spaceIndex === si);
      return p && p.ownerId === prop.ownerId && !p.isMortgaged;
    }).length;
    return utilCount === 2 ? diceTotal * 10 : diceTotal * 4;
  }

  if (space.type === "property" && space.rent) {
    if (prop.houses > 0) {
      const builtRent = space.rent[prop.houses];
      return gameState.houseRules.quickMode
        ? Math.ceil(builtRent * 1.25)
        : builtRent;
    }
    const hasMonopoly = ownsFullColorGroup(
      gameState,
      prop.ownerId,
      space.colorGroup
    );
    const baseRent = hasMonopoly ? space.rent[0] * 2 : space.rent[0];
    return gameState.houseRules.quickMode
      ? Math.ceil(baseRent * 1.25)
      : baseRent;
  }

  return 0;
}

export function getNextChanceCard(gameState: GameState): GameCard {
  const card = CHANCE_CARDS[gameState.chanceIndex % CHANCE_CARDS.length];
  gameState.chanceIndex = (gameState.chanceIndex + 1) % CHANCE_CARDS.length;
  return card;
}

export function getNextCommunityChestCard(gameState: GameState): GameCard {
  const card =
    COMMUNITY_CHEST_CARDS[gameState.communityIndex % COMMUNITY_CHEST_CARDS.length];
  gameState.communityIndex =
    (gameState.communityIndex + 1) % COMMUNITY_CHEST_CARDS.length;
  return card;
}

export function countPlayerHouses(
  gameState: GameState,
  playerId: string
): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const prop of gameState.properties) {
    if (prop.ownerId === playerId) {
      if (prop.houses === 5) hotels++;
      else houses += prop.houses;
    }
  }
  return { houses, hotels };
}

export function getPlayerPropertiesInGroup(
  gameState: GameState,
  playerId: string,
  colorGroup: string
): PropertyState[] {
  const groupSpaces = COLOR_GROUPS[colorGroup] ?? [];
  return gameState.properties.filter(
    (property) =>
      property.ownerId === playerId && groupSpaces.includes(property.spaceIndex)
  );
}

export function canBuildHouse(
  gameState: GameState,
  playerId: string,
  spaceIndex: number
): boolean {
  const space = BOARD_SPACES[spaceIndex];
  if (!space || space.type !== "property") {
    return false;
  }

  const property = gameState.properties.find(
    (entry) => entry.spaceIndex === spaceIndex && entry.ownerId === playerId
  );
  if (!property || property.isMortgaged || property.houses >= 5) {
    return false;
  }

  if (!ownsFullColorGroup(gameState, playerId, space.colorGroup)) {
    return false;
  }

  const groupProperties = getPlayerPropertiesInGroup(
    gameState,
    playerId,
    space.colorGroup
  );
  const minimumBuildings = Math.min(...groupProperties.map((entry) => entry.houses));
  return property.houses === minimumBuildings;
}

export function canSellHouse(
  gameState: GameState,
  playerId: string,
  spaceIndex: number
): boolean {
  const space = BOARD_SPACES[spaceIndex];
  if (!space || space.type !== "property") {
    return false;
  }

  const property = gameState.properties.find(
    (entry) => entry.spaceIndex === spaceIndex && entry.ownerId === playerId
  );
  if (!property || property.houses <= 0) {
    return false;
  }

  const groupProperties = getPlayerPropertiesInGroup(
    gameState,
    playerId,
    space.colorGroup
  );
  const maximumBuildings = Math.max(...groupProperties.map((entry) => entry.houses));
  return property.houses === maximumBuildings;
}

export function canMortgageProperty(
  gameState: GameState,
  playerId: string,
  spaceIndex: number
): boolean {
  const space = BOARD_SPACES[spaceIndex];
  if (!space || (space.type !== "property" && space.type !== "railroad" && space.type !== "utility")) {
    return false;
  }

  const property = gameState.properties.find(
    (entry) => entry.spaceIndex === spaceIndex && entry.ownerId === playerId
  );
  if (!property || property.isMortgaged) {
    return false;
  }

  if (space.type !== "property") {
    return true;
  }

  const groupProperties = getPlayerPropertiesInGroup(
    gameState,
    playerId,
    space.colorGroup
  );
  return groupProperties.every((entry) => entry.houses === 0);
}

export function canTradeProperty(
  gameState: GameState,
  playerId: string,
  spaceIndex: number
): boolean {
  const space = BOARD_SPACES[spaceIndex];
  if (!space || (space.type !== "property" && space.type !== "railroad" && space.type !== "utility")) {
    return false;
  }

  const property = gameState.properties.find(
    (entry) => entry.spaceIndex === spaceIndex && entry.ownerId === playerId
  );
  if (!property) {
    return false;
  }

  if (space.type !== "property") {
    return true;
  }

  const groupProperties = getPlayerPropertiesInGroup(
    gameState,
    playerId,
    space.colorGroup
  );

  return groupProperties.every((entry) => entry.houses === 0);
}

export function getSpeedDieValue(face: SpeedDieFace | null): number {
  return face === 1 || face === 2 || face === 3 ? face : 0;
}

export function findNextUnownedProperty(
  gameState: GameState,
  startIndex: number
): number | null {
  for (let offset = 1; offset < BOARD_SPACES.length; offset += 1) {
    const index = (startIndex + offset) % BOARD_SPACES.length;
    const space = BOARD_SPACES[index];
    if (
      (space.type === "property" ||
        space.type === "railroad" ||
        space.type === "utility") &&
      !getPropertyOwner(gameState, index)
    ) {
      return index;
    }
  }

  return null;
}

export function findNextOpponentOwnedProperty(
  gameState: GameState,
  startIndex: number,
  playerId: string
): number | null {
  for (let offset = 1; offset < BOARD_SPACES.length; offset += 1) {
    const index = (startIndex + offset) % BOARD_SPACES.length;
    const owner = getPropertyOwner(gameState, index);
    if (owner && owner.ownerId !== playerId && !owner.isMortgaged) {
      return index;
    }
  }

  return null;
}
