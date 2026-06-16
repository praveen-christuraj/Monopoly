import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  authUserId: uuid("auth_user_id").unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Room table - stores game rooms
export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  hostId: text("host_id").notNull(),
  hostUserId: uuid("host_user_id").references(() => users.id),
  status: text("status").notNull().default("waiting"), // waiting, playing, finished
  maxPlayers: integer("max_players").notNull().default(4),
  currentTurnIndex: integer("current_turn_index").notNull().default(0),
  stateVersion: integer("state_version").notNull().default(0),
  gameState: jsonb("game_state"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Players table - stores players in rooms
export const players = pgTable("players", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id),
  userId: uuid("user_id").references(() => users.id),
  playerId: text("player_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull().default(0),
  money: integer("money").notNull().default(1500),
  isActive: boolean("is_active").notNull().default(true),
  isBankrupt: boolean("is_bankrupt").notNull().default(false),
  inJail: boolean("in_jail").notNull().default(false),
  jailTurns: integer("jail_turns").notNull().default(0),
  getOutOfJailCards: integer("get_out_of_jail_cards").notNull().default(0),
  properties: jsonb("properties").notNull().default([]),
  turnOrder: integer("turn_order").notNull().default(0),
  doublesCount: integer("doubles_count").notNull().default(0),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Game log - stores game events
export const gameLog = pgTable("game_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id),
  playerId: text("player_id"),
  action: text("action").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const roomEvents = pgTable("room_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id),
  stateVersion: integer("state_version").notNull().default(0),
  eventType: text("event_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
