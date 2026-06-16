"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser, MyRoomSummary } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [view, setView] = useState<"home" | "create" | "join" | "login" | "signup">("home");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [rooms, setRooms] = useState<MyRoomSummary[]>([]);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authExpired, setAuthExpired] = useState(false);

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/me/rooms", { cache: "no-store" });
    if (res.status === 401) {
      setUser(null);
      setRooms([]);
      setAuthExpired(true);
      return;
    }
    const data = await res.json();
    setRooms(data.rooms ?? []);
  }, []);

  const loadSession = useCallback(async () => {
    setBooting(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.status === 401) {
        setUser(null);
        setRooms([]);
        return;
      }
      const data = await res.json();
      setUser(data.user ?? null);

      if (data.user) {
        await loadRooms();
      } else {
        setRooms([]);
      }
    } catch {
      setError("Failed to restore your session");
    } finally {
      setBooting(false);
    }
  }, [loadRooms]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadSession();
    }, 0);

    return () => {
      window.clearTimeout(initialLoad);
    };
  }, [loadSession]);

  useEffect(() => {
    const handleFocusRefresh = () => {
      void loadSession();
    };

    window.addEventListener("focus", handleFocusRefresh);
    window.addEventListener("online", handleFocusRefresh);

    return () => {
      window.removeEventListener("focus", handleFocusRefresh);
      window.removeEventListener("online", handleFocusRefresh);
    };
  }, [loadSession]);

  async function handleSignup() {
    if (!email.trim() || !password || !displayName.trim()) {
      setError("Please fill in every field");
      return;
    }

    setLoading(true);
    setError("");
    setAuthExpired(false);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUser(data.user);
      setView("home");
      await loadRooms();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError("Please enter your email and password");
      return;
    }

    setLoading(true);
    setError("");
    setAuthExpired(false);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUser(data.user);
      setView("home");
      await loadRooms();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to log in");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    setError("");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      setRooms([]);
      setView("home");
      setPassword("");
    } catch {
      setError("Failed to log out");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!user) {
      setError("Please log in first");
      return;
    }

    setLoading(true);
    setError("");
    setAuthExpired(false);
    try {
      const res = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPlayers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/game/${data.roomId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!user) {
      setError("Please log in first");
      return;
    }
    if (!roomCode.trim()) {
      setError("Please enter room code");
      return;
    }
    setLoading(true);
    setError("");
    setAuthExpired(false);
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: roomCode.trim().toUpperCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/game/${data.roomId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join room");
    } finally {
      setLoading(false);
    }
  }

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-5xl mb-4 animate-dice-roll">🎲</div>
          <p className="text-emerald-300 font-medium">Loading lobby...</p>
        </div>
      </div>
    );
  }

  const activeRooms = rooms.filter((room) => room.isActive);
  const pastRooms = rooms.filter((room) => !room.isActive);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 text-6xl opacity-10 rotate-12">🎲</div>
        <div className="absolute top-20 right-16 text-5xl opacity-10 -rotate-12">🏠</div>
        <div className="absolute bottom-20 left-20 text-5xl opacity-10 rotate-45">💰</div>
        <div className="absolute bottom-10 right-10 text-6xl opacity-10 -rotate-45">🎩</div>
        <div className="absolute top-1/2 left-5 text-4xl opacity-10">🚗</div>
        <div className="absolute top-1/3 right-5 text-4xl opacity-10">🏦</div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="text-7xl mb-4">🎲</div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
            MONOPOLY
          </h1>
          <p className="text-emerald-300 mt-1 text-lg font-medium">Online Multiplayer</p>
          <div className="w-24 h-1 bg-gradient-to-r from-yellow-400 to-amber-500 mx-auto mt-3 rounded-full" />
        </div>

        {user && (
          <div className="mb-4 bg-emerald-900/60 backdrop-blur rounded-2xl p-4 border border-emerald-700/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-emerald-400">
                  Signed in as
                </p>
                <p className="font-bold text-amber-400">{user.displayName}</p>
                <p className="text-xs text-emerald-300/80">{user.email}</p>
                <p className="text-[11px] text-green-300 mt-1">
                  Session {user.presenceStatus}
                </p>
              </div>
              <button
                onClick={handleLogout}
                disabled={loading}
                className="px-3 py-2 text-xs bg-emerald-800 hover:bg-emerald-700 rounded-lg transition-all disabled:opacity-50"
              >
                Log Out
              </button>
            </div>
          </div>
        )}

        {/* Home View */}
        {view === "home" && (
          <div className="space-y-4 animate-fade-in">
            {!user ? (
              <div className="space-y-4">
                <button
                  onClick={() => {
                    setError("");
                    setView("login");
                  }}
                  className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-gray-900 font-bold text-lg rounded-2xl shadow-lg shadow-amber-500/30 transition-all duration-200 active:scale-95"
                >
                  🔐 Log In
                </button>
                <button
                  onClick={() => {
                    setError("");
                    setView("signup");
                  }}
                  className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold text-lg rounded-2xl shadow-lg shadow-emerald-500/30 transition-all duration-200 active:scale-95"
                >
                  ✨ Create Account
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => setView("create")}
                  className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-gray-900 font-bold text-lg rounded-2xl shadow-lg shadow-amber-500/30 transition-all duration-200 active:scale-95"
                >
                  🏠 Create Room
                </button>
                <button
                  onClick={() => setView("join")}
                  className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold text-lg rounded-2xl shadow-lg shadow-emerald-500/30 transition-all duration-200 active:scale-95"
                >
                  🎮 Join Room
                </button>
              </div>
            )}

            {error && (
              <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>
            )}

            {authExpired && (
              <p className="text-amber-300 text-sm bg-amber-900/30 px-3 py-2 rounded-lg">
                Your session expired. Log in again to resume your games.
              </p>
            )}

            {user && rooms.length > 0 && (
              <div className="bg-emerald-900/50 backdrop-blur rounded-2xl p-5 border border-emerald-700/50 space-y-4">
                <div>
                  <h3 className="font-bold text-emerald-300 mb-1 text-sm uppercase tracking-wider">
                    Resume Game
                  </h3>
                  <p className="text-xs text-emerald-200/70">
                    Reopen active rooms or review finished games from this account.
                  </p>
                </div>

                {activeRooms.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wider text-amber-300">
                      Active Games
                    </p>
                    {activeRooms.map((room) => (
                      <button
                        key={room.roomId}
                        onClick={() => router.push(`/game/${room.roomId}`)}
                        className="w-full text-left bg-emerald-800/50 hover:bg-emerald-800/80 rounded-xl px-4 py-3 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-amber-400 tracking-[0.2em]">
                            {room.code}
                          </span>
                          <span className="text-xs uppercase text-green-300">
                            {room.status}
                          </span>
                        </div>
                        <p className="text-sm text-emerald-100 mt-1">
                          Playing as {room.playerName}
                        </p>
                        <p className="text-xs text-emerald-200/70 mt-1">
                          {room.summary}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {pastRooms.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wider text-emerald-300/80">
                      Past Rooms
                    </p>
                    {pastRooms.map((room) => (
                      <button
                        key={room.roomId}
                        onClick={() => router.push(`/game/${room.roomId}`)}
                        className="w-full text-left bg-emerald-950/60 hover:bg-emerald-900/80 rounded-xl px-4 py-3 transition-colors border border-emerald-800/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-amber-400 tracking-[0.2em]">
                            {room.code}
                          </span>
                          <span className="text-xs uppercase text-emerald-300/80">
                            {room.status}
                          </span>
                        </div>
                        <p className="text-sm text-emerald-100 mt-1">
                          Playing as {room.playerName}
                        </p>
                        <p className="text-xs text-emerald-200/70 mt-1">
                          {room.summary}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 bg-emerald-900/50 backdrop-blur rounded-2xl p-5 border border-emerald-700/50">
              <h3 className="font-bold text-emerald-300 mb-3 text-sm uppercase tracking-wider">How to Play</h3>
              <div className="space-y-2.5 text-sm text-emerald-200/80">
                <p className="flex items-start gap-2"><span className="text-amber-400">1.</span> Sign in once to keep your player identity</p>
                <p className="flex items-start gap-2"><span className="text-amber-400">2.</span> Create a room or join with a code</p>
                <p className="flex items-start gap-2"><span className="text-amber-400">3.</span> Come back later and resume from this account</p>
                <p className="flex items-start gap-2"><span className="text-amber-400">4.</span> Roll dice, buy properties, collect rent!</p>
                <p className="flex items-start gap-2"><span className="text-amber-400">5.</span> Last player standing wins! 🏆</p>
              </div>
            </div>
          </div>
        )}

        {view === "login" && (
          <div className="animate-fade-in bg-emerald-900/60 backdrop-blur-lg rounded-2xl p-6 border border-emerald-700/50 shadow-2xl">
            <button
              onClick={() => { setView("home"); setError(""); }}
              className="text-emerald-400 hover:text-emerald-300 mb-4 flex items-center gap-1 text-sm"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold mb-5 text-amber-400">Log In</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-emerald-300 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-white placeholder-emerald-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-emerald-300 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-white placeholder-emerald-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                />
              </div>
              {error && (
                <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>
              )}
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-gray-900 font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {loading ? "Logging in..." : "Log In"}
              </button>
            </div>
          </div>
        )}

        {view === "signup" && (
          <div className="animate-fade-in bg-emerald-900/60 backdrop-blur-lg rounded-2xl p-6 border border-emerald-700/50 shadow-2xl">
            <button
              onClick={() => { setView("home"); setError(""); }}
              className="text-emerald-400 hover:text-emerald-300 mb-4 flex items-center gap-1 text-sm"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold mb-5 text-amber-400">Create Account</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-emerald-300 mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Choose your player name"
                  maxLength={20}
                  className="w-full px-4 py-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-white placeholder-emerald-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-emerald-300 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-white placeholder-emerald-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-emerald-300 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-white placeholder-emerald-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                />
              </div>
              {error && (
                <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>
              )}
              <button
                onClick={handleSignup}
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {loading ? "Creating..." : "Create Account"}
              </button>
            </div>
          </div>
        )}

        {/* Create Room View */}
        {view === "create" && (
          <div className="animate-fade-in bg-emerald-900/60 backdrop-blur-lg rounded-2xl p-6 border border-emerald-700/50 shadow-2xl">
            <button
              onClick={() => { setView("home"); setError(""); }}
              className="text-emerald-400 hover:text-emerald-300 mb-4 flex items-center gap-1 text-sm"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold mb-5 text-amber-400">Create Room</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-emerald-300 mb-1.5">Player Identity</label>
                <div className="w-full px-4 py-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-white">
                  {user?.displayName ?? "Not signed in"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-emerald-300 mb-1.5">Max Players</label>
                <select
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n} Players</option>
                  ))}
                </select>
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>
              )}

              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-gray-900 font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {loading ? "Creating..." : "Create Room 🚀"}
              </button>
            </div>
          </div>
        )}

        {/* Join Room View */}
        {view === "join" && (
          <div className="animate-fade-in bg-emerald-900/60 backdrop-blur-lg rounded-2xl p-6 border border-emerald-700/50 shadow-2xl">
            <button
              onClick={() => { setView("home"); setError(""); }}
              className="text-emerald-400 hover:text-emerald-300 mb-4 flex items-center gap-1 text-sm"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold mb-5 text-amber-400">Join Room</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-emerald-300 mb-1.5">Player Identity</label>
                <div className="w-full px-4 py-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-white">
                  {user?.displayName ?? "Not signed in"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-emerald-300 mb-1.5">Room Code</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="w-full px-4 py-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-white placeholder-emerald-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-center text-2xl tracking-[0.3em] font-mono transition-all"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>
              )}

              <button
                onClick={handleJoin}
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {loading ? "Joining..." : "Join Room 🎮"}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-emerald-600 text-xs mt-6">
          Works on Android &amp; iOS • No app download needed
        </p>
      </div>
    </div>
  );
}
