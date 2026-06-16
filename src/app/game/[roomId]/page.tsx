"use client";

import { useState, useEffect, useCallback, use, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import GameBoard from "@/components/GameBoard";
import PlayerPanel from "@/components/PlayerPanel";
import GameControls from "@/components/GameControls";
import GameLog from "@/components/GameLog";
import PropertyModal from "@/components/PropertyModal";
import type { GameStateResponse, PlayerData } from "@/lib/types";
import type { GameState } from "@/lib/game-engine";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/formatters";

export default function GamePage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const router = useRouter();
  const { roomId } = use(params);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [state, setState] = useState<GameStateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "disabled" | "connecting" | "connected"
  >(supabase ? "connecting" : "disabled");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<number | null>(null);
  const [tab, setTab] = useState<"board" | "players" | "log">("board");
  const refetchTimerRef = useRef<number | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/state`, {
        cache: "no-store",
      });

      if (res.status === 401) {
        setSessionExpired(true);
        return;
      }

      if (res.status === 403) {
        setAccessDenied(true);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setState(data);
        setSessionExpired(false);
        setAccessDenied(false);
        setHasLoadedOnce(true);
        setError("");
        setIsOffline(false);
      }
    } catch {
      if (hasLoadedOnce) {
        setError("Connection lost. Re-syncing...");
        setIsOffline(true);
      }
    }
  }, [hasLoadedOnce, roomId]);

  const scheduleFetchState = useCallback(() => {
    if (refetchTimerRef.current) {
      window.clearTimeout(refetchTimerRef.current);
    }

    refetchTimerRef.current = window.setTimeout(() => {
      void fetchState();
      refetchTimerRef.current = null;
    }, 200);
  }, [fetchState]);

  // Poll for game state
  useEffect(() => {
    const initialSync = window.setTimeout(() => {
      void fetchState();
    }, 0);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchState();
      }
    }, supabase ? 15000 : 2000);

    const handleVisibleSync = () => {
      if (document.visibilityState === "visible") {
        void fetchState();
      }
    };

    const handleOnline = () => {
      setIsOffline(false);
      void fetchState();
    };

    const handleOffline = () => {
      setIsOffline(true);
      setError("You are offline. Waiting to reconnect...");
    };

    window.addEventListener("focus", handleOnline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibleSync);

    return () => {
      window.clearTimeout(initialSync);
      clearInterval(interval);
      window.removeEventListener("focus", handleOnline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibleSync);
    };
  }, [fetchState, supabase]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`room-sync-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_events",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          scheduleFetchState();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("disabled");
        } else {
          setRealtimeStatus("connecting");
        }
      });

    return () => {
      if (refetchTimerRef.current) {
        window.clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [roomId, scheduleFetchState, supabase]);

  async function handleAction(
    action: string,
    data?: Record<string, unknown>
  ) {
    if (!state) return;
    if (isOffline) {
      setError("You are offline. Reconnect before taking a turn.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          expectedStateVersion: state.room.stateVersion,
          ...data,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setError("This room changed in another tab. Syncing latest game state...");
        } else {
          setError(result.error || "Action failed");
        }
      }
      // Immediately refresh state
      await fetchState();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function updateHouseRule(
    key:
      | "auctionsEnabled"
      | "freeParkingJackpot"
      | "doubleSalaryOnGo"
      | "quickMode"
      | "speedDieEnabled",
    value: boolean
  ) {
    await handleAction("update-house-rules", {
      houseRules: {
        [key]: value,
      },
    });
  }

  if (sessionExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-emerald-900/60 border border-emerald-700/50 rounded-2xl p-6 text-center">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-amber-400">Session Expired</h1>
          <p className="text-emerald-200/80 mt-2">
            Log in again to recover this game from your account.
          </p>
          <div className="mt-5 space-y-2">
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-gray-900 font-bold rounded-xl"
            >
              Back to Lobby
            </button>
            <button
              onClick={() => void fetchState()}
              className="w-full py-3 bg-emerald-800 hover:bg-emerald-700 rounded-xl"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-emerald-900/60 border border-emerald-700/50 rounded-2xl p-6 text-center">
          <div className="text-5xl mb-3">🚫</div>
          <h1 className="text-2xl font-bold text-amber-400">Access Denied</h1>
          <p className="text-emerald-200/80 mt-2">
            This signed-in account is not a player in this room.
          </p>
          <button
            onClick={() => router.push("/")}
            className="w-full mt-5 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-gray-900 font-bold rounded-xl"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-5xl mb-4 animate-dice-roll">🎲</div>
          <p className="text-emerald-300 font-medium">Loading game...</p>
        </div>
      </div>
    );
  }

  const { room, players, logs } = state;
  const playerId = state.viewerPlayerId;
  const gameState = room.gameState as GameState;
  const isHost = playerId === room.hostId;
  const activePlayers = players
    .filter((p) => !p.isBankrupt)
    .sort((a, b) => a.turnOrder - b.turnOrder);
  const currentTurnPlayer =
    activePlayers.length > 0
      ? activePlayers[room.currentTurnIndex % activePlayers.length]
      : null;
  const isMyTurn = currentTurnPlayer?.playerId === playerId;
  const myPlayer = players.find((p) => p.playerId === playerId) || null;
  const getPresenceBadgeClass = (presenceStatus: PlayerData["presenceStatus"]) => {
    if (presenceStatus === "online") return "bg-green-500/30 text-green-300";
    if (presenceStatus === "away") return "bg-amber-500/30 text-amber-300";
    return "bg-gray-500/30 text-gray-300";
  };

  // ======== WAITING ROOM ========
  if (room.status === "waiting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🏠</div>
            <h1 className="text-2xl font-bold text-amber-400">Waiting Room</h1>
          </div>

          {/* Room Code */}
          <div className="bg-emerald-800/60 rounded-2xl p-5 mb-4 text-center border border-emerald-700/50">
            <p className="text-xs text-emerald-400 uppercase tracking-wider mb-2">
              Room Code
            </p>
            <div className="text-4xl font-mono font-black tracking-[0.4em] text-amber-400">
              {room.code}
            </div>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(room.code);
              }}
              className="mt-3 text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-700/50 px-4 py-1.5 rounded-full transition-all active:scale-95"
            >
              📋 Copy Code
            </button>
          </div>

          {/* Players list */}
          <div className="bg-emerald-900/60 rounded-2xl p-4 mb-4 border border-emerald-700/50">
            <h3 className="text-sm font-bold text-emerald-300 mb-3">
              Players ({players.length}/{room.maxPlayers})
            </h3>
            <div className="space-y-2">
              {players
                .sort((a, b) => a.turnOrder - b.turnOrder)
                .map((p) => (
                  <div
                    key={p.playerId}
                    className="flex items-center gap-3 bg-emerald-800/50 rounded-lg px-3 py-2"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 border-white/20"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.playerId === room.hostId ? "👑" : "🎮"}
                    </div>
                    <span className="font-medium flex-1">{p.name}</span>
                    {p.playerId === playerId && (
                      <span className="text-xs bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded-full">
                        YOU
                      </span>
                    )}
                    {p.playerId === room.hostId && (
                      <span className="text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full">
                        HOST
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${getPresenceBadgeClass(
                        p.presenceStatus
                      )}`}
                    >
                      {p.presenceStatus.toUpperCase()}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <div className="bg-emerald-900/60 rounded-2xl p-4 mb-4 border border-emerald-700/50">
            <h3 className="text-sm font-bold text-emerald-300 mb-3">
              House Rules
            </h3>
            <div className="space-y-2">
              {[
                {
                  key: "auctionsEnabled" as const,
                  label: "Auction skipped properties",
                  description: "Official Monopoly rule",
                },
                {
                  key: "freeParkingJackpot" as const,
                  label: "Free Parking jackpot",
                  description: "Collect pooled taxes and fees",
                },
                {
                  key: "doubleSalaryOnGo" as const,
                  label: "Double salary on GO",
                  description: "Land directly on GO for extra salary",
                },
                {
                  key: "quickMode" as const,
                  label: "Quick Mode",
                  description: "Faster economy with lower starting cash and stronger rent",
                },
                {
                  key: "speedDieEnabled" as const,
                  label: "Speed Die",
                  description: "Add a third movement die in 3+ player games",
                },
              ].map((rule) => (
                <div
                  key={rule.key}
                  className="flex items-center justify-between gap-3 rounded-xl bg-emerald-800/45 px-3 py-2.5"
                >
                  <div>
                    <div className="text-sm font-medium text-amber-50">
                      {rule.label}
                    </div>
                    <div className="text-[11px] text-emerald-200/70">
                      {rule.description}
                    </div>
                  </div>
                  {isHost ? (
                    <button
                      onClick={() =>
                        void updateHouseRule(
                          rule.key,
                          !gameState.houseRules[rule.key]
                        )
                      }
                      disabled={loading}
                      className={`min-w-14 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                        gameState.houseRules[rule.key]
                          ? "bg-amber-500 text-gray-950"
                          : "bg-slate-700 text-slate-200"
                      }`}
                    >
                      {gameState.houseRules[rule.key] ? "ON" : "OFF"}
                    </button>
                  ) : (
                    <span
                      className={`min-w-14 text-center px-3 py-1.5 rounded-full text-xs font-bold ${
                        gameState.houseRules[rule.key]
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-slate-700/70 text-slate-300"
                      }`}
                    >
                      {gameState.houseRules[rule.key] ? "ON" : "OFF"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Start button */}
          {isHost && (
            <button
              onClick={() => handleAction("start-game")}
              disabled={loading || players.length < 2}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-gray-900 font-bold text-lg rounded-2xl shadow-lg shadow-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              {players.length < 2
                ? "Waiting for players..."
                : loading
                ? "Starting..."
                : `🎲 Start Game (${players.length} players)`}
            </button>
          )}
          {!isHost && (
            <div className="text-center py-4 text-emerald-400/70 text-sm">
              ⏳ Waiting for host to start the game...
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm text-center mt-3 bg-red-900/30 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ======== GAME OVER ========
  if (room.status === "finished" || gameState?.phase === "game-over") {
    const winner = players.find(
      (p) => p.playerId === gameState?.winnerId
    );
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center animate-fade-in">
          <div className="text-7xl mb-4">🏆</div>
          <h1 className="text-3xl font-black text-amber-400 mb-2">
            Game Over!
          </h1>
          {winner && (
            <div className="mb-4">
              <p className="text-xl text-emerald-200">
                <span className="font-bold">{winner.name}</span> wins!
              </p>
              <p className="text-amber-300 mt-1">
                Final balance: {formatCurrency(winner.money)}
              </p>
            </div>
          )}
          <div className="space-y-2 mt-6 max-w-xs mx-auto">
            {players
              .sort((a, b) => b.money - a.money)
              .map((p, i) => (
                <div
                  key={p.playerId}
                  className="flex items-center gap-3 bg-emerald-900/60 rounded-lg px-4 py-2.5 border border-emerald-700/50"
                >
                  <span className="text-lg w-6">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                  </span>
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="flex-1 font-medium text-sm">{p.name}</span>
                  <span className="text-amber-400 font-bold text-sm">
                    {formatCurrency(p.money)}
                  </span>
                </div>
              ))}
          </div>
          <button
            onClick={() => (window.location.href = "/")}
            className="mt-6 px-8 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-gray-900 font-bold rounded-xl transition-all active:scale-95"
          >
            🏠 Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // ======== ACTIVE GAME ========
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="bg-emerald-950/85 backdrop-blur border-b border-amber-500/10 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-amber-200/80">IN</span>
          <span className="font-bold text-amber-400 text-sm tracking-[0.25em]">MONOPOLY INDIA</span>
        </div>
        <div className="bg-emerald-800/80 px-3 py-1 rounded-full">
          <span className="text-xs text-emerald-300 font-mono">{room.code}</span>
        </div>
        {myPlayer && (
          <div className="text-amber-400 font-bold text-sm">
            {formatCurrency(myPlayer.money)}
          </div>
        )}
      </div>

      <div className="px-3 py-1 text-[11px] text-center bg-emerald-950/60 text-emerald-300/80 border-b border-emerald-900/80">
        Live sync:{" "}
        {realtimeStatus === "connected"
          ? "Supabase Realtime connected"
          : realtimeStatus === "connecting"
          ? "connecting"
          : "polling fallback"}
      </div>

      {/* Turn indicator */}
      <div
        className={`px-3 py-1.5 text-center text-sm font-medium ${
          isMyTurn
            ? "bg-amber-500/20 text-amber-300"
            : "bg-emerald-800/50 text-emerald-300"
        }`}
      >
        {isMyTurn ? (
          <>
            🎯 Your turn!{" "}
            {gameState?.phase === "roll"
              ? "Roll the dice"
              : gameState?.phase === "speed-die-choice"
              ? "Resolve your Speed Die choice"
              : gameState?.phase === "trade-response"
              ? "Trade response pending"
              : gameState?.phase === "auction"
              ? "Auction is live"
              : gameState?.phase === "buy-decision"
              ? "Buy or pass?"
              : gameState?.phase === "end-turn"
              ? "End your turn"
              : ""}
          </>
        ) : (
          <>
            ⏳ {currentTurnPlayer?.name}&apos;s turn
            {gameState?.phase === "auction"
              ? " • auction in progress"
              : gameState?.phase === "trade-response"
              ? " • trade response pending"
              : ""}
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div
          className={`px-3 py-2 text-xs text-center flex items-center justify-center gap-3 ${
            isOffline
              ? "bg-amber-900/50 text-amber-300"
              : "bg-red-900/50 text-red-300"
          }`}
        >
          <span>{error}</span>
          <button
            onClick={() => void fetchState()}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
          >
            Retry Sync
          </button>
        </div>
      )}

      {/* Tab navigation (mobile) */}
      <div className="flex border-b border-emerald-800 md:hidden">
        {(["board", "players", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
              tab === t
                ? "text-amber-400 border-b-2 border-amber-400"
                : "text-emerald-500"
            }`}
          >
            {t === "board" ? "🎮 Board" : t === "players" ? "👥 Players" : "📜 Log"}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {/* Desktop layout */}
        <div className="hidden md:flex h-full">
          {/* Left: Board */}
          <div className="flex-1 p-4 overflow-auto flex items-start justify-center">
            <GameBoard
              players={players}
              gameState={gameState}
              onSpaceClick={setSelectedSpace}
            />
          </div>

          {/* Right: Sidebar */}
          <div className="w-80 border-l border-emerald-800 p-3 overflow-y-auto custom-scrollbar space-y-3">
            <PlayerPanel
              players={players}
              currentPlayerId={playerId}
              currentTurnPlayerId={currentTurnPlayer?.playerId ?? null}
              gameState={gameState}
            />
            <GameControls
              roomId={roomId}
              playerId={playerId || ""}
              players={players}
              isMyTurn={isMyTurn}
              currentPlayer={myPlayer}
              gameState={gameState}
              onAction={handleAction}
              loading={loading}
            />
            <GameLog logs={logs} />
          </div>
        </div>

        {/* Mobile layout */}
        <div className="md:hidden h-full overflow-auto">
          {tab === "board" && (
            <div className="p-2">
              <GameBoard
                players={players}
                gameState={gameState}
                onSpaceClick={setSelectedSpace}
              />
              <div className="mt-3 px-1">
                <GameControls
                  roomId={roomId}
                  playerId={playerId || ""}
                  players={players}
                  isMyTurn={isMyTurn}
                  currentPlayer={myPlayer}
                  gameState={gameState}
                  onAction={handleAction}
                  loading={loading}
                />
              </div>
            </div>
          )}
          {tab === "players" && (
            <div className="p-3">
              <PlayerPanel
                players={players}
                currentPlayerId={playerId}
                currentTurnPlayerId={currentTurnPlayer?.playerId ?? null}
                gameState={gameState}
              />
            </div>
          )}
          {tab === "log" && (
            <div className="p-3">
              <GameLog logs={logs} />
            </div>
          )}
        </div>
      </div>

      {/* Property modal */}
      {selectedSpace !== null && (
        <PropertyModal
          spaceIndex={selectedSpace}
          players={players}
          gameState={gameState}
          onClose={() => setSelectedSpace(null)}
        />
      )}
    </div>
  );
}
