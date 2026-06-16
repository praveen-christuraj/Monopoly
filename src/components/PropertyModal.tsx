"use client";

import { BOARD_SPACES, COLOR_GROUP_CSS } from "@/lib/monopoly-data";
import { formatCurrency } from "@/lib/formatters";
import type { PlayerData } from "@/lib/types";
import type { GameState } from "@/lib/game-engine";

interface PropertyModalProps {
  spaceIndex: number;
  players: PlayerData[];
  gameState: GameState;
  onClose: () => void;
}

export default function PropertyModal({
  spaceIndex,
  players,
  gameState,
  onClose,
}: PropertyModalProps) {
  const space = BOARD_SPACES[spaceIndex];
  if (!space) return null;

  const prop = gameState?.properties?.find(
    (p) => p.spaceIndex === spaceIndex
  );
  const owner = prop
    ? players.find((p) => p.playerId === prop.ownerId)
    : null;
  const color = COLOR_GROUP_CSS[space.colorGroup] || "#666";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-emerald-950 rounded-2xl border border-amber-400/20 max-w-sm w-full shadow-2xl animate-fade-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Color header */}
        <div
          className="h-16 flex items-end p-3"
          style={{ backgroundColor: color }}
        >
          <h2 className="font-bold text-white text-lg drop-shadow-md">
            {space.name}
          </h2>
        </div>

        <div className="p-4 space-y-3">
          {/* Type */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-emerald-400">Type</span>
            <span className="capitalize font-medium">
              {space.type.replace("-", " ")}
            </span>
          </div>

          {/* Price */}
          {space.price && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-400">Price</span>
              <span className="font-bold text-amber-400">{formatCurrency(space.price)}</span>
            </div>
          )}

          {/* Rent table */}
          {space.rent && space.type === "property" && (
            <div className="bg-emerald-950/50 rounded-lg p-3">
              <div className="text-xs text-emerald-400 mb-2 font-medium">Rent Schedule</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Base rent</span>
                  <span className="font-medium">{formatCurrency(space.rent[0])}</span>
                </div>
                {space.rent.slice(1).map((r, i) => (
                  <div key={i} className="flex justify-between">
                    <span>
                      {i < 4 ? `With ${i + 1} house${i > 0 ? "s" : ""}` : "With hotel"}
                    </span>
                    <span className="font-medium">{formatCurrency(r)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* House cost */}
          {space.houseCost && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-400">House Cost</span>
              <span>{formatCurrency(space.houseCost)}</span>
            </div>
          )}

          {/* Mortgage value */}
          {space.mortgageValue && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-400">Mortgage Value</span>
              <span>{formatCurrency(space.mortgageValue)}</span>
            </div>
          )}

          {/* Tax */}
          {space.taxAmount && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-400">Tax Amount</span>
              <span className="text-red-400 font-bold">{formatCurrency(space.taxAmount)}</span>
            </div>
          )}

          {/* Owner */}
          {owner && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-400">Owner</span>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: owner.color }}
                />
                <span className="font-medium">{owner.name}</span>
              </div>
            </div>
          )}

          {/* Houses */}
          {prop && prop.houses > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-400">Buildings</span>
              <span>
                {prop.houses === 5 ? "🏨 Hotel" : `🏠 × ${prop.houses}`}
              </span>
            </div>
          )}

          {prop?.isMortgaged && (
            <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg text-center font-medium">
              📋 MORTGAGED
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg font-medium text-sm transition-all active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
