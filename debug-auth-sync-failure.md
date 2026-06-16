# Debug Session: auth-sync-failure [OPEN]

## Symptom
- Signup/login reaches the app flow but returns "failed to synchronize".

## Expected
- After Supabase Auth succeeds, the app should mirror the user into the app database and create the local game session successfully.

## Initial Hypotheses
- H1: The `/api/auth/sync` route is receiving no Supabase access token from the browser.
- H2: The server-side Supabase client is misconfigured or missing required environment variables, so `auth.getUser()` fails.
- H3: The database upsert into the app `users` table fails because the schema in Supabase does not match the current code.
- H4: The local `sessions` table write or cookie creation fails after the Supabase user is verified.
- H5: The frontend is calling sync at the wrong point in the auth lifecycle and does not yet have a valid session.

## Evidence Plan
- Instrument the frontend auth flow around Supabase session acquisition and sync request dispatch.
- Instrument `/api/auth/sync` around bearer token parsing, Supabase user verification, DB upsert, and local session creation.
- Reproduce signup/login once and compare the emitted runtime evidence against the hypotheses above.
