"use client";

import { BOARD_SPACES, COLOR_GROUP_CSS, PLAYER_TOKENS } from "@/lib/monopoly-data";
import type { PlayerData } from "@/lib/types";
import type { GameState } from "@/lib/game-engine";

interface PlayerPanelProps {
  players: PlayerData[];
  currentPlayerId: string | null;
  currentTurnPlayerId: string | null;
  gameState: GameState;
}

export default function PlayerPanel({
  players,
  currentPlayerId,
  currentTurnPlayerId,
  gameState,
}: PlayerPanelProps) {
  const sorted = [...players].sort((a, b) => a.turnOrder - b.turnOrder);

  return (
    <div className="space-y-2">
      {sorted.map((player) => {
        const isCurrentTurn = player.playerId === currentTurnPlayerId;
        const isMe = player.playerId === currentPlayerId;
        const ownedProps = gameState?.properties?.filter(
          (p) => p.ownerId === player.playerId
        ) ?? [];
        const presenceClass =
          player.presenceStatus === "online"
            ? "bg-green-500/30 text-green-300"
            : player.presenceStatus === "away"
            ? "bg-amber-500/30 text-amber-300"
            : "bg-gray-500/30 text-gray-300";

        return (
          <div
            key={player.playerId}
            className={`rounded-xl p-3 border transition-all ${
              player.isBankrupt
                ? "bg-gray-900/50 border-gray-700 opacity-50"
                : isCurrentTurn
                ? "bg-emerald-800/80 border-amber-400 animate-pulse-glow"
                : "bg-emerald-900/60 border-emerald-700/50"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs border-2"
                style={{
                  backgroundColor: player.color,
                  borderColor: isCurrentTurn ? "#FCD34D" : "transparent",
                }}
              >
                {PLAYER_TOKENS[player.turnOrder] || "●"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-sm truncate">
                    {player.name}
                  </span>
                  {isMe && (
                    <span className="text-[10px] bg-amber-500/30 text-amber-300 px-1.5 rounded-full">
                      YOU
                    </span>
                  )}
                  {isCurrentTurn && !player.isBankrupt && (
                    <span className="text-[10px] bg-green-500/30 text-green-300 px-1.5 rounded-full">
                      TURN
                    </span>
                  )}
                  {player.isBankrupt && (
                    <span className="text-[10px] bg-red-500/30 text-red-300 px-1.5 rounded-full">
                      BANKRUPT
                    </span>
                  )}
                  {player.inJail && !player.isBankrupt && (
                    <span className="text-[10px] bg-orange-500/30 text-orange-300 px-1.5 rounded-full">
                      JAIL
                    </span>
                  )}
                  {!player.isBankrupt && (
                    <span className={`text-[10px] px-1.5 rounded-full ${presenceClass}`}>
                      {player.presenceStatus.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-amber-400 font-bold text-sm">
                ${player.money.toLocaleString()}
              </span>
            </div>

            {/* Properties */}
            {ownedProps.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {ownedProps.map((prop) => {
                  const space = BOARD_SPACES[prop.spaceIndex];
                  const color = COLOR_GROUP_CSS[space.colorGroup] || "#666";
                  return (
                    <div
                      key={prop.spaceIndex}
                      className={`w-4 h-4 rounded-sm border border-white/20 flex items-center justify-center text-[6px] ${
                        prop.isMortgaged ? "opacity-40" : ""
                      }`}
                      style={{ backgroundColor: color }}
                      title={`${space.name}${prop.houses > 0 ? ` (${prop.houses === 5 ? "Hotel" : prop.houses + " houses"})` : ""}${prop.isMortgaged ? " [MORTGAGED]" : ""}`}
                    >
                      {prop.houses === 5 ? "H" : prop.houses > 0 ? prop.houses : ""}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
