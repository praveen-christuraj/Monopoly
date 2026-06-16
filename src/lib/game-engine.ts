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

export interface GameState {
  properties: PropertyState[];
  chanceIndex: number;
  communityIndex: number;
  freeParking: number;
  lastDice: [number, number] | null;
  lastCard: GameCard | null;
  phase: "roll" | "post-roll" | "buy-decision" | "action" | "end-turn" | "game-over";
  pendingAction: string | null;
  winnerId: string | null;
  turnCount: number;
}

export function createInitialGameState(): GameState {
  return {
    properties: [],
    chanceIndex: 0,
    communityIndex: 0,
    freeParking: 0,
    lastDice: null,
    lastCard: null,
    phase: "roll",
    pendingAction: null,
    winnerId: null,
    turnCount: 0,
  };
}

export function rollDice(): [number, number] {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  return [d1, d2];
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
      return space.rent[prop.houses];
    }
    const hasMonopoly = ownsFullColorGroup(
      gameState,
      prop.ownerId,
      space.colorGroup
    );
    return hasMonopoly ? space.rent[0] * 2 : space.rent[0];
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
