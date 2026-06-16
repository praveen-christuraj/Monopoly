"use client";

import { BOARD_SPACES, COLOR_GROUP_CSS, PLAYER_TOKENS } from "@/lib/monopoly-data";
import type { PlayerData, RoomData } from "@/lib/types";
import type { GameState, PropertyState } from "@/lib/game-engine";

interface GameBoardProps {
  players: PlayerData[];
  gameState: GameState;
  onSpaceClick?: (index: number) => void;
}

const BOARD_SIZE = 11; // 11x11 grid

function getSpaceBgColor(space: (typeof BOARD_SPACES)[0]) {
  if (space.colorGroup !== "none") {
    return COLOR_GROUP_CSS[space.colorGroup];
  }
  return undefined;
}

function getSpaceEmoji(space: (typeof BOARD_SPACES)[0]) {
  switch (space.type) {
    case "go": return "→";
    case "jail": return "🔒";
    case "free-parking": return "🅿️";
    case "go-to-jail": return "🚔";
    case "chance": return "❓";
    case "community-chest": return "📦";
    case "tax": return "💰";
    case "railroad": return "🚂";
    case "utility": return space.index === 12 ? "💡" : "🚰";
    default: return "";
  }
}

export default function GameBoard({
  players,
  gameState,
  onSpaceClick,
}: GameBoardProps) {
  // Map space index to grid position
  function getGridPosition(index: number): { row: number; col: number } {
    if (index <= 10) {
      // Bottom row: right to left
      return { row: 10, col: 10 - index };
    } else if (index <= 20) {
      // Left column: bottom to top
      return { row: 10 - (index - 10), col: 0 };
    } else if (index <= 30) {
      // Top row: left to right
      return { row: 0, col: index - 20 };
    } else {
      // Right column: top to bottom
      return { row: index - 30, col: 10 };
    }
  }

  function getPlayersOnSpace(spaceIndex: number): PlayerData[] {
    return players.filter(
      (p) => p.position === spaceIndex && !p.isBankrupt
    );
  }

  function getPropertyState(spaceIndex: number): PropertyState | undefined {
    return gameState?.properties?.find((p) => p.spaceIndex === spaceIndex);
  }

  function renderHouses(prop: PropertyState) {
    if (!prop || prop.houses === 0) return null;
    if (prop.houses === 5) {
      return <span className="text-[8px]">🏨</span>;
    }
    return (
      <span className="text-[7px]">
        {"🏠".repeat(prop.houses)}
      </span>
    );
  }

  return (
    <div className="w-full max-w-[min(95vw,600px)] mx-auto aspect-square">
      <div
        className="grid gap-[1px] w-full h-full bg-emerald-800/50 rounded-lg overflow-hidden"
        style={{
          gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
        }}
      >
        {/* Center area */}
        <div
          className="bg-emerald-800 flex items-center justify-center"
          style={{
            gridColumn: "2 / 11",
            gridRow: "2 / 11",
          }}
        >
          <div className="text-center p-2">
            <div className="text-3xl md:text-5xl mb-1">🎲</div>
            <div className="text-amber-400 font-black text-xs md:text-lg tracking-wider">
              MONOPOLY
            </div>
            {gameState?.lastDice && (
              <div className="mt-2 flex items-center justify-center gap-2">
                <DiceFace value={gameState.lastDice[0]} />
                <DiceFace value={gameState.lastDice[1]} />
              </div>
            )}
            {gameState?.lastCard && (
              <div className="mt-2 bg-amber-900/50 rounded p-1.5 text-[9px] md:text-xs text-amber-200 max-w-[180px] mx-auto">
                {gameState.lastCard.text}
              </div>
            )}
          </div>
        </div>

        {/* Board spaces */}
        {BOARD_SPACES.map((space) => {
          const { row, col } = getGridPosition(space.index);
          const spacePlayers = getPlayersOnSpace(space.index);
          const propState = getPropertyState(space.index);
          const colorBg = getSpaceBgColor(space);
          const isCorner = [0, 10, 20, 30].includes(space.index);
          const owner = propState
            ? players.find((p) => p.playerId === propState.ownerId)
            : null;

          // Determine color strip direction
          const isBottom = space.index > 0 && space.index < 10;
          const isLeft = space.index > 10 && space.index < 20;
          const isTop = space.index > 20 && space.index < 30;
          const isRight = space.index > 30 && space.index < 40;

          return (
            <div
              key={space.index}
              onClick={() => onSpaceClick?.(space.index)}
              className="relative bg-emerald-900 flex flex-col items-center justify-center cursor-pointer hover:bg-emerald-800 transition-colors overflow-hidden"
              style={{
                gridRow: row + 1,
                gridColumn: col + 1,
              }}
              title={`${space.name}${space.price ? ` - $${space.price}` : ""}`}
            >
              {/* Color strip for properties */}
              {colorBg && !isCorner && (
                <div
                  className="absolute"
                  style={{
                    backgroundColor: colorBg,
                    ...(isBottom ? { top: 0, left: 0, right: 0, height: "30%" } : {}),
                    ...(isTop ? { bottom: 0, left: 0, right: 0, height: "30%" } : {}),
                    ...(isLeft ? { right: 0, top: 0, bottom: 0, width: "30%" } : {}),
                    ...(isRight ? { left: 0, top: 0, bottom: 0, width: "30%" } : {}),
                  }}
                />
              )}

              {/* Owner indicator */}
              {owner && (
                <div
                  className="absolute top-0 right-0 w-2 h-2 rounded-bl"
                  style={{ backgroundColor: owner.color }}
                />
              )}

              {/* Houses */}
              {propState && (
                <div className="absolute top-0 left-0 z-10">
                  {renderHouses(propState)}
                </div>
              )}

              {/* Space content */}
              <div className="relative z-10 text-center leading-none">
                {isCorner ? (
                  <span className="text-[10px] md:text-sm font-bold">
                    {getSpaceEmoji(space)}
                  </span>
                ) : (
                  <>
                    {space.type === "property" || space.type === "railroad" || space.type === "utility" ? (
                      <span className="text-[6px] md:text-[8px] font-medium text-white/80 leading-tight block">
                        {space.name.length > 10
                          ? space.name.split(" ")[0]
                          : space.name}
                      </span>
                    ) : (
                      <span className="text-[9px] md:text-xs">{getSpaceEmoji(space)}</span>
                    )}
                  </>
                )}
              </div>

              {/* Mortgaged indicator */}
              {propState?.isMortgaged && (
                <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center z-20">
                  <span className="text-[7px] text-red-400 font-bold">M</span>
                </div>
              )}

              {/* Players on this space */}
              {spacePlayers.length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 flex flex-wrap justify-center gap-[1px] z-20 p-[1px]">
                  {spacePlayers.map((p, i) => (
                    <div
                      key={p.playerId}
                      className="w-3 h-3 md:w-4 md:h-4 rounded-full flex items-center justify-center text-[6px] md:text-[8px] border border-white/50 animate-bounce-token"
                      style={{
                        backgroundColor: p.color,
                        animationDelay: `${i * 0.1}s`,
                      }}
                      title={p.name}
                    >
                      {PLAYER_TOKENS[p.turnOrder] || "●"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiceFace({ value }: { value: number }) {
  const dots: Record<number, string> = {
    1: "⚀",
    2: "⚁",
    3: "⚂",
    4: "⚃",
    5: "⚄",
    6: "⚅",
  };
  return (
    <span className="text-2xl md:text-3xl text-white animate-dice-roll">
      {dots[value] || "?"}
    </span>
  );
}
