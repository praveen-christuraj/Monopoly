export type PresenceStatus = "online" | "away" | "offline";

const ONLINE_WINDOW_MS = 1000 * 45;
const AWAY_WINDOW_MS = 1000 * 60 * 5;

export function getPresenceStatus(lastSeenAt: Date | string): PresenceStatus {
  const timestamp =
    lastSeenAt instanceof Date ? lastSeenAt.getTime() : new Date(lastSeenAt).getTime();
  const elapsedMs = Date.now() - timestamp;

  if (elapsedMs <= ONLINE_WINDOW_MS) {
    return "online";
  }

  if (elapsedMs <= AWAY_WINDOW_MS) {
    return "away";
  }

  return "offline";
}
