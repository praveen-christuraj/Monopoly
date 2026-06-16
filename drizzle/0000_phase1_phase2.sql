CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "auth_user_id" uuid,
  "email" text NOT NULL,
  "display_name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");

ALTER TABLE IF EXISTS "users"
  DROP COLUMN IF EXISTS "password_hash";

ALTER TABLE IF EXISTS "users"
  ADD COLUMN IF NOT EXISTS "auth_user_id" uuid;

CREATE UNIQUE INDEX IF NOT EXISTS "users_auth_user_id_unique" ON "users" ("auth_user_id");

CREATE TABLE IF NOT EXISTS "sessions" (
  "token_hash" text PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "expires_at" timestamp NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");

CREATE TABLE IF NOT EXISTS "rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text NOT NULL,
  "host_id" text NOT NULL,
  "host_user_id" uuid REFERENCES "users"("id"),
  "status" text DEFAULT 'waiting' NOT NULL,
  "max_players" integer DEFAULT 4 NOT NULL,
  "current_turn_index" integer DEFAULT 0 NOT NULL,
  "state_version" integer DEFAULT 0 NOT NULL,
  "game_state" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "rooms_code_unique" ON "rooms" ("code");

ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "host_user_id" uuid REFERENCES "users"("id");

ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "state_version" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "players" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id"),
  "user_id" uuid REFERENCES "users"("id"),
  "player_id" text NOT NULL,
  "name" text NOT NULL,
  "color" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "money" integer DEFAULT 1500 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_bankrupt" boolean DEFAULT false NOT NULL,
  "in_jail" boolean DEFAULT false NOT NULL,
  "jail_turns" integer DEFAULT 0 NOT NULL,
  "get_out_of_jail_cards" integer DEFAULT 0 NOT NULL,
  "properties" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "turn_order" integer DEFAULT 0 NOT NULL,
  "doubles_count" integer DEFAULT 0 NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "players_room_id_idx" ON "players" ("room_id");
CREATE INDEX IF NOT EXISTS "players_user_id_idx" ON "players" ("user_id");

ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id");

ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "game_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id"),
  "player_id" text,
  "action" text NOT NULL,
  "details" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "game_log_room_id_idx" ON "game_log" ("room_id");

CREATE TABLE IF NOT EXISTS "room_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id"),
  "state_version" integer DEFAULT 0 NOT NULL,
  "event_type" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "room_events_room_id_idx" ON "room_events" ("room_id");
