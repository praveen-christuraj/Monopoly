import type {
  GameState,
  HouseRules,
  PendingAuctionState,
  PendingTradeState,
} from "./game-engine";
import type { GameCard } from "./monopoly-data";
import type { PresenceStatus } from "./presence";

export interface PlayerData {
  id: string;
  userId: string | null;
  playerId: string;
  name: string;
  color: string;
  position: number;
  money: number;
  isActive: boolean;
  isBankrupt: boolean;
  inJail: boolean;
  jailTurns: number;
  getOutOfJailCards: number;
  properties: unknown;
  turnOrder: number;
  doublesCount: number;
  lastSeenAt: string;
  presenceStatus: PresenceStatus;
}

export interface RoomData {
  id: string;
  code: string;
  hostId: string;
  hostUserId: string | null;
  status: string;
  maxPlayers: number;
  currentTurnIndex: number;
  stateVersion: number;
  gameState: GameState;
  updatedAt: string;
}

export interface HouseRulesPatch {
  houseRules: Partial<HouseRules>;
}

export interface AuctionData extends PendingAuctionState {}

export interface TradeData extends PendingTradeState {}

export interface LogEntry {
  id: string;
  playerId: string | null;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface GameStateResponse {
  room: RoomData;
  players: PlayerData[];
  logs: LogEntry[];
  viewerPlayerId: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  lastSeenAt: string;
  presenceStatus: PresenceStatus;
}

export interface MyRoomSummary {
  roomId: string;
  code: string;
  status: string;
  updatedAt: string;
  playerName: string;
  isHost: boolean;
  isActive: boolean;
  playerCount: number;
  maxPlayers: number;
  currentTurnPlayerName: string | null;
  summary: string;
}
