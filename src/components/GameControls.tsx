"use client";

import { useState } from "react";
import { BOARD_SPACES, COLOR_GROUPS, COLOR_GROUP_CSS } from "@/lib/monopoly-data";
import type { PlayerData } from "@/lib/types";
import type { GameState } from "@/lib/game-engine";

interface GameControlsProps {
  roomId: string;
  playerId: string;
  isMyTurn: boolean;
  currentPlayer: PlayerData | null;
  gameState: GameState;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  loading: boolean;
}

export default function GameControls({
  roomId,
  playerId,
  isMyTurn,
  currentPlayer,
  gameState,
  onAction,
  loading,
}: GameControlsProps) {
  const [showProperties, setShowProperties] = useState(false);

  if (!currentPlayer || !gameState) return null;

  const phase = gameState.phase;
  const myProperties = gameState.properties?.filter(
    (p) => p.ownerId === playerId
  ) ?? [];

  const currentSpace = BOARD_SPACES[currentPlayer.position];

  // Check if player can build on any property
  const buildableProperties = myProperties.filter((prop) => {
    const space = BOARD_SPACES[prop.spaceIndex];
    if (space.type !== "property" || prop.isMortgaged) return false;
    const groupSpaces = COLOR_GROUPS[space.colorGroup];
    if (!groupSpaces) return false;
    const ownsAll = groupSpaces.every((si) => {
      const p = gameState.properties?.find((x) => x.spaceIndex === si);
      return p && p.ownerId === playerId && !p.isMortgaged;
    });
    return ownsAll && prop.houses < 5;
  });

  return (
    <div className="space-y-3">
      {/* Current space info */}
      {isMyTurn && (
        <div className="bg-emerald-800/50 rounded-xl p-3 border border-emerald-700/50">
          <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1">
            Your Position
          </div>
          <div className="font-bold text-sm">{currentSpace?.name}</div>
        </div>
      )}

      {/* Jail options */}
      {isMyTurn && currentPlayer.inJail && phase === "roll" && (
        <div className="bg-orange-900/40 rounded-xl p-3 border border-orange-700/50">
          <p className="text-orange-300 text-sm mb-2 font-medium">🔒 You are in Jail!</p>
          <div className="space-y-2">
            <button
              onClick={() => onAction("roll-dice")}
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-sm disabled:opacity-50 transition-all active:scale-95"
            >
              🎲 Roll for Doubles
            </button>
            <button
              onClick={() => onAction("pay-jail-fee")}
              disabled={loading || currentPlayer.money < 50}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium text-sm disabled:opacity-50 transition-all active:scale-95"
            >
              💵 Pay $50 to Leave
            </button>
            {(currentPlayer.getOutOfJailCards || 0) > 0 && (
              <button
                onClick={() => onAction("use-jail-card")}
                disabled={loading}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium text-sm disabled:opacity-50 transition-all active:scale-95"
              >
                🎫 Use Get Out of Jail Card
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main action buttons */}
      {isMyTurn && !currentPlayer.inJail && (
        <div className="space-y-2">
          {phase === "roll" && (
            <button
              onClick={() => onAction("roll-dice")}
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-xl font-bold text-lg shadow-lg shadow-blue-500/30 disabled:opacity-50 transition-all active:scale-95"
            >
              {loading ? "Rolling..." : "🎲 Roll Dice"}
            </button>
          )}

          {phase === "buy-decision" && currentSpace?.price && (
            <div className="space-y-2">
              <div className="bg-amber-900/40 rounded-xl p-3 border border-amber-700/50">
                <p className="text-amber-300 font-medium text-sm">
                  🏠 {currentSpace.name} is available!
                </p>
                <p className="text-amber-200/70 text-xs mt-1">
                  Price: ${currentSpace.price} | Rent: ${currentSpace.rent?.[0]}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onAction("buy-property")}
                  disabled={loading || currentPlayer.money < currentSpace.price}
                  className="py-2.5 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
                >
                  Buy ${currentSpace.price}
                </button>
                <button
                  onClick={() => onAction("skip-buy")}
                  disabled={loading}
                  className="py-2.5 bg-gray-600 hover:bg-gray-500 rounded-lg font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
                >
                  Pass ✋
                </button>
              </div>
            </div>
          )}

          {phase === "end-turn" && (
            <button
              onClick={() => onAction("end-turn")}
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 rounded-xl font-bold shadow-lg disabled:opacity-50 transition-all active:scale-95"
            >
              End Turn →
            </button>
          )}
        </div>
      )}

      {/* Not your turn message */}
      {!isMyTurn && phase !== "game-over" && (
        <div className="text-center py-4 text-emerald-400/70 text-sm">
          ⏳ Waiting for other player&apos;s turn...
        </div>
      )}

      {/* Property management */}
      {myProperties.length > 0 && (
        <div>
          <button
            onClick={() => setShowProperties(!showProperties)}
            className="w-full py-2 text-sm text-emerald-300 hover:text-emerald-200 transition-colors flex items-center justify-center gap-1"
          >
            🏘️ My Properties ({myProperties.length})
            <span className="text-xs">{showProperties ? "▲" : "▼"}</span>
          </button>

          {showProperties && (
            <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar">
              {myProperties.map((prop) => {
                const space = BOARD_SPACES[prop.spaceIndex];
                const color = COLOR_GROUP_CSS[space.colorGroup] || "#666";
                const canBuild = buildableProperties.some(
                  (b) => b.spaceIndex === prop.spaceIndex
                );

                return (
                  <div
                    key={prop.spaceIndex}
                    className={`rounded-lg p-2 border flex items-center gap-2 ${
                      prop.isMortgaged
                        ? "bg-gray-900/50 border-gray-700 opacity-60"
                        : "bg-emerald-900/50 border-emerald-700/50"
                    }`}
                  >
                    <div
                      className="w-3 h-8 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {space.name}
                      </div>
                      <div className="text-[10px] text-emerald-400/70">
                        {prop.houses === 5
                          ? "🏨 Hotel"
                          : prop.houses > 0
                          ? `🏠 ×${prop.houses}`
                          : prop.isMortgaged
                          ? "📋 Mortgaged"
                          : "No buildings"}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {canBuild && currentPlayer.money >= (space.houseCost || 0) && (
                        <button
                          onClick={() =>
                            onAction("build-house", {
                              spaceIndex: prop.spaceIndex,
                            })
                          }
                          disabled={loading}
                          className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-[10px] font-medium disabled:opacity-50 transition-all"
                          title={`Build $${space.houseCost}`}
                        >
                          +🏠
                        </button>
                      )}
                      {prop.houses > 0 && (
                        <button
                          onClick={() =>
                            onAction("sell-house", {
                              spaceIndex: prop.spaceIndex,
                            })
                          }
                          disabled={loading}
                          className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-[10px] font-medium disabled:opacity-50 transition-all"
                        >
                          -🏠
                        </button>
                      )}
                      {!prop.isMortgaged && prop.houses === 0 && (
                        <button
                          onClick={() =>
                            onAction("mortgage", {
                              spaceIndex: prop.spaceIndex,
                            })
                          }
                          disabled={loading}
                          className="px-2 py-1 bg-orange-700 hover:bg-orange-600 rounded text-[10px] font-medium disabled:opacity-50 transition-all"
                        >
                          📋
                        </button>
                      )}
                      {prop.isMortgaged && (
                        <button
                          onClick={() =>
                            onAction("unmortgage", {
                              spaceIndex: prop.spaceIndex,
                            })
                          }
                          disabled={loading}
                          className="px-2 py-1 bg-blue-700 hover:bg-blue-600 rounded text-[10px] font-medium disabled:opacity-50 transition-all"
                        >
                          ↩️
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
