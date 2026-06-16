CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "display_name" text NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");

CREATE TABLE IF NOT EXISTS "sessions" (
  "token_hash" text PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "expires_at" timestamp NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "host_user_id" uuid REFERENCES "users"("id");

ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "state_version" integer DEFAULT 0 NOT NULL;

ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id");

ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "room_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id"),
  "state_version" integer DEFAULT 0 NOT NULL,
  "event_type" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
