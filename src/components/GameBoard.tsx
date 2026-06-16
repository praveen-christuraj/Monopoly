"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOARD_SPACES, COLOR_GROUP_CSS, PLAYER_TOKENS } from "@/lib/monopoly-data";
import { formatCurrency } from "@/lib/formatters";
import type { PlayerData } from "@/lib/types";
import type { GameState, PropertyState } from "@/lib/game-engine";

interface GameBoardProps {
  players: PlayerData[];
  gameState: GameState;
  onSpaceClick?: (index: number) => void;
}

const BOARD_SIZE = 11;
const CORNER_INDICES = new Set([0, 10, 20, 30]);

function getSpaceAccent(space: (typeof BOARD_SPACES)[0]) {
  return space.colorGroup !== "none" ? COLOR_GROUP_CSS[space.colorGroup] : undefined;
}

function getSpaceIcon(space: (typeof BOARD_SPACES)[0]) {
  switch (space.type) {
    case "go":
      return "GO";
    case "jail":
      return "JAIL";
    case "free-parking":
      return "FREE";
    case "go-to-jail":
      return "LOCK";
    case "chance":
      return "K";
    case "community-chest":
      return "JS";
    case "tax":
      return "TAX";
    case "railroad":
      return "IR";
    case "utility":
      return space.index === 12 ? "PWR" : "WTR";
    default:
      return "";
  }
}

function getGridPosition(index: number): { row: number; col: number } {
  if (index <= 10) {
    return { row: 10, col: 10 - index };
  }
  if (index <= 20) {
    return { row: 10 - (index - 10), col: 0 };
  }
  if (index <= 30) {
    return { row: 0, col: index - 20 };
  }
  return { row: index - 30, col: 10 };
}

function buildTravelPath(from: number, to: number): number[] {
  if (from === to) {
    return [to];
  }

  const path: number[] = [];
  let current = from;

  while (current !== to) {
    current = (current + 1) % BOARD_SPACES.length;
    path.push(current);
  }

  return path;
}

function getSpeedDieLabel(face: GameState["lastSpeedDie"]) {
  if (face === null) {
    return null;
  }
  if (face === "mr-monopoly") {
    return "Mr. Monopoly";
  }
  if (face === "bus") {
    return "Bus";
  }
  return String(face);
}

export default function GameBoard({
  players,
  gameState,
  onSpaceClick,
}: GameBoardProps) {
  const [displayedPositions, setDisplayedPositions] = useState<Record<string, number>>({});
  const [isRollingDice, setIsRollingDice] = useState(false);
  const prevPositionsRef = useRef<Record<string, number>>({});
  const diceKeyRef = useRef<string>("");
  const movementTimersRef = useRef<number[]>([]);

  useEffect(() => {
    for (const timer of movementTimersRef.current) {
      window.clearTimeout(timer);
    }
    movementTimersRef.current = [];

    const previousPositions = prevPositionsRef.current;
    const latestPositions: Record<string, number> = {};

    for (const player of players) {
      const previous = previousPositions[player.playerId];
      latestPositions[player.playerId] = player.position;

      if (previous === undefined || previous === player.position) {
        continue;
      }

      const travelPath = buildTravelPath(previous, player.position);
      travelPath.forEach((spaceIndex, stepIndex) => {
        const timer = window.setTimeout(() => {
          setDisplayedPositions((current) => ({
            ...current,
            [player.playerId]: spaceIndex,
          }));
        }, (stepIndex + 1) * 90);
        movementTimersRef.current.push(timer);
      });
    }

    prevPositionsRef.current = latestPositions;

    return () => {
      for (const timer of movementTimersRef.current) {
        window.clearTimeout(timer);
      }
      movementTimersRef.current = [];
    };
  }, [players]);

  useEffect(() => {
    const diceKey = gameState?.lastDice?.join("-") ?? "";
    if (!diceKey || diceKey === diceKeyRef.current) {
      return;
    }

    diceKeyRef.current = diceKey;
    setIsRollingDice(true);

    const timer = window.setTimeout(() => {
      setIsRollingDice(false);
    }, 850);

    return () => window.clearTimeout(timer);
  }, [gameState?.lastDice]);

  const playersBySpace = useMemo(() => {
    const grouped = new Map<number, PlayerData[]>();

    for (const player of players) {
      if (player.isBankrupt) {
        continue;
      }

      const position = displayedPositions[player.playerId] ?? player.position;
      const entries = grouped.get(position) ?? [];
      entries.push(player);
      grouped.set(position, entries);
    }

    return grouped;
  }, [displayedPositions, players]);

  const pendingAuction = gameState.pendingAuction;
  const auctionSpace = pendingAuction
    ? BOARD_SPACES[pendingAuction.spaceIndex]
    : null;
  const auctionLeader = pendingAuction?.currentLeaderPlayerId
    ? players.find((player) => player.playerId === pendingAuction.currentLeaderPlayerId)
    : null;
  const pendingTrade = gameState.pendingTrade;
  const tradeFromPlayer = pendingTrade
    ? players.find((player) => player.playerId === pendingTrade.fromPlayerId)
    : null;
  const tradeToPlayer = pendingTrade
    ? players.find((player) => player.playerId === pendingTrade.toPlayerId)
    : null;
  const highlightedOfferedSpaces = new Set(
    pendingTrade?.offeredPropertyIndexes ?? []
  );
  const highlightedRequestedSpaces = new Set(
    pendingTrade?.requestedPropertyIndexes ?? []
  );

  function getPropertyState(spaceIndex: number): PropertyState | undefined {
    return gameState?.properties?.find((entry) => entry.spaceIndex === spaceIndex);
  }

  function renderBuildings(prop: PropertyState) {
    if (prop.houses === 0) {
      return null;
    }

    if (prop.houses === 5) {
      return <span className="text-[9px]">HOTEL</span>;
    }

    return (
      <span className="text-[8px] tracking-tight text-lime-200">
        {"H".repeat(prop.houses)}
      </span>
    );
  }

  return (
    <div className="w-full max-w-[min(96vw,760px)] mx-auto aspect-square rounded-[2rem] p-3 board-shell">
      <div
        className="grid gap-[2px] w-full h-full rounded-[1.65rem] overflow-hidden board-surface"
        style={{
          gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
        }}
      >
        <div
          className="relative flex items-center justify-center board-center"
          style={{
            gridColumn: "2 / 11",
            gridRow: "2 / 11",
          }}
        >
          <div className="absolute inset-0 india-board-glow pointer-events-none" />
          <div className="relative z-10 text-center px-4">
            <p className="text-[10px] md:text-xs uppercase tracking-[0.55em] text-amber-200/70">
              India Edition
            </p>
            <h2 className="text-2xl md:text-5xl font-black tracking-[0.25em] text-amber-300 drop-shadow-[0_6px_20px_rgba(0,0,0,0.55)]">
              MONOPOLY
            </h2>
            <p className="text-[11px] md:text-sm text-emerald-100/80 mt-2">
              Metro board • premium match table • rupee economy
            </p>

            {gameState?.lastDice && (
              <div className="mt-5 flex items-center justify-center gap-3">
                <DiceFace value={gameState.lastDice[0]} rolling={isRollingDice} />
                <DiceFace value={gameState.lastDice[1]} rolling={isRollingDice} />
              </div>
            )}

            {(gameState?.lastSpeedDie || gameState?.pendingSpeedDie) && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {gameState.lastSpeedDie && (
                  <div className="premium-card px-3 py-2 text-left">
                    <div className="text-[10px] uppercase tracking-[0.35em] text-amber-300/80">
                      Speed Die
                    </div>
                    <div className="text-xs font-bold text-amber-50 mt-1">
                      {getSpeedDieLabel(gameState.lastSpeedDie)}
                    </div>
                  </div>
                )}
                {gameState.pendingSpeedDie && (
                  <div className="premium-card px-3 py-2 text-left">
                    <div className="text-[10px] uppercase tracking-[0.35em] text-emerald-300/80">
                      Pending Choice
                    </div>
                    <div className="text-xs font-bold text-emerald-50 mt-1">
                      {gameState.pendingSpeedDie.type === "bus-choice"
                        ? "Bus move selection"
                        : gameState.pendingSpeedDie.type === "triple-choice"
                        ? "Choose any space"
                        : "Mr. Monopoly bonus"}
                    </div>
                  </div>
                )}
              </div>
            )}

            {pendingAuction && auctionSpace && (
              <div className="mt-5 max-w-[280px] mx-auto premium-card p-3 text-left border border-amber-400/20">
                <div className="text-[10px] uppercase tracking-[0.35em] text-amber-300/80">
                  Live Auction
                </div>
                <div className="text-sm font-bold text-amber-50 mt-1">
                  {auctionSpace.name}
                </div>
                <div className="text-[11px] text-amber-100/80 mt-1">
                  Current bid: {formatCurrency(pendingAuction.currentBid)}
                </div>
                <div className="text-[11px] text-emerald-100/80 mt-1">
                  Leader: {auctionLeader?.name ?? "No bids yet"}
                </div>
              </div>
            )}

            {pendingTrade && tradeFromPlayer && tradeToPlayer && (
              <div className="mt-5 max-w-[320px] mx-auto premium-card p-3 text-left border border-emerald-400/20">
                <div className="text-[10px] uppercase tracking-[0.35em] text-emerald-300/80">
                  Pending Trade
                </div>
                <div className="text-sm font-bold text-amber-50 mt-1">
                  {tradeFromPlayer.name} {"->"} {tradeToPlayer.name}
                </div>
                <div className="text-[11px] text-emerald-100/80 mt-2">
                  Offer:{" "}
                  {pendingTrade.offerCash > 0
                    ? formatCurrency(pendingTrade.offerCash)
                    : "No cash"}
                  {pendingTrade.offeredPropertyIndexes.length > 0
                    ? ` + ${pendingTrade.offeredPropertyIndexes
                        .map((spaceIndex) => BOARD_SPACES[spaceIndex]?.name)
                        .join(", ")}`
                    : ""}
                </div>
                <div className="text-[11px] text-amber-100/80 mt-1">
                  Wants:{" "}
                  {pendingTrade.requestCash > 0
                    ? formatCurrency(pendingTrade.requestCash)
                    : "No cash"}
                  {pendingTrade.requestedPropertyIndexes.length > 0
                    ? ` + ${pendingTrade.requestedPropertyIndexes
                        .map((spaceIndex) => BOARD_SPACES[spaceIndex]?.name)
                        .join(", ")}`
                    : ""}
                </div>
              </div>
            )}

            {gameState?.lastCard && (
              <div className="mt-5 max-w-[240px] mx-auto premium-card p-3 text-left">
                <div className="text-[10px] uppercase tracking-[0.35em] text-amber-300/80">
                  {gameState.lastCard.action === "get-out-of-jail"
                    ? "Special Card"
                    : "Latest Draw"}
                </div>
                <div className="text-[11px] md:text-xs text-amber-50/90 mt-1 leading-relaxed">
                  {gameState.lastCard.text}
                </div>
              </div>
            )}
          </div>
        </div>

        {BOARD_SPACES.map((space) => {
          const { row, col } = getGridPosition(space.index);
          const spacePlayers = playersBySpace.get(space.index) ?? [];
          const propertyState = getPropertyState(space.index);
          const accent = getSpaceAccent(space);
          const isCorner = CORNER_INDICES.has(space.index);
          const owner = propertyState
            ? players.find((player) => player.playerId === propertyState.ownerId)
            : null;
          const isBottom = space.index > 0 && space.index < 10;
          const isLeft = space.index > 10 && space.index < 20;
          const isTop = space.index > 20 && space.index < 30;
          const isRight = space.index > 30 && space.index < 40;
          const isAuctionSpace = pendingAuction?.spaceIndex === space.index;
          const isTradeOffered = highlightedOfferedSpaces.has(space.index);
          const isTradeRequested = highlightedRequestedSpaces.has(space.index);

          return (
            <button
              key={space.index}
              type="button"
              onClick={() => onSpaceClick?.(space.index)}
              className={`relative overflow-hidden board-tile text-left transition-transform duration-200 hover:scale-[1.02] ${
                isAuctionSpace
                  ? "ring-2 ring-amber-300/80 shadow-[0_0_18px_rgba(251,191,36,0.35)]"
                  : isTradeOffered
                  ? "ring-2 ring-emerald-300/70 shadow-[0_0_18px_rgba(16,185,129,0.25)]"
                  : isTradeRequested
                  ? "ring-2 ring-sky-300/70 shadow-[0_0_18px_rgba(56,189,248,0.25)]"
                  : ""
              }`}
              style={{
                gridRow: row + 1,
                gridColumn: col + 1,
              }}
              title={`${space.name}${space.price ? ` • ${formatCurrency(space.price)}` : ""}`}
            >
              <div className="absolute inset-0 board-tile-shine" />

              {accent && !isCorner && (
                <div
                  className="absolute property-strip"
                  style={{
                    background: `linear-gradient(135deg, ${accent}, rgba(255,255,255,0.28))`,
                    ...(isBottom ? { top: 0, left: 0, right: 0, height: "26%" } : {}),
                    ...(isTop ? { bottom: 0, left: 0, right: 0, height: "26%" } : {}),
                    ...(isLeft ? { right: 0, top: 0, bottom: 0, width: "26%" } : {}),
                    ...(isRight ? { left: 0, top: 0, bottom: 0, width: "26%" } : {}),
                  }}
                />
              )}

              {owner && (
                <div
                  className="absolute top-1 right-1 w-3 h-3 rounded-full border border-white/60 shadow-[0_0_12px_rgba(255,255,255,0.3)]"
                  style={{ backgroundColor: owner.color }}
                />
              )}

              {isAuctionSpace && (
                <div className="absolute bottom-1 right-1 z-20 rounded-full bg-amber-500/85 px-1.5 py-0.5 text-[8px] font-black tracking-[0.2em] text-slate-950">
                  BID
                </div>
              )}

              {isTradeOffered && (
                <div className="absolute bottom-1 right-1 z-20 rounded-full bg-emerald-500/85 px-1.5 py-0.5 text-[8px] font-black tracking-[0.15em] text-slate-950">
                  OFFER
                </div>
              )}

              {isTradeRequested && !isTradeOffered && (
                <div className="absolute bottom-1 right-1 z-20 rounded-full bg-sky-400/85 px-1.5 py-0.5 text-[8px] font-black tracking-[0.15em] text-slate-950">
                  WANT
                </div>
              )}

              {propertyState && (
                <div className="absolute top-1 left-1 z-10 rounded-full bg-black/40 px-1.5 py-0.5 leading-none">
                  {renderBuildings(propertyState)}
                </div>
              )}

              <div className="relative z-10 h-full flex flex-col justify-between p-1.5 md:p-2">
                <div>
                  <div className="text-[7px] md:text-[9px] font-semibold tracking-[0.24em] text-amber-100/70 uppercase">
                    {getSpaceIcon(space)}
                  </div>
                  <div className={`${isCorner ? "text-[9px] md:text-xs" : "text-[7px] md:text-[9px]"} font-semibold text-white leading-tight mt-1`}>
                    {space.name}
                  </div>
                </div>

                {(space.type === "property" || space.type === "railroad" || space.type === "utility") &&
                  space.price && (
                    <div className="text-[7px] md:text-[9px] text-amber-200/85 font-medium">
                      {formatCurrency(space.price)}
                    </div>
                  )}

                {space.type === "tax" && space.taxAmount && (
                  <div className="text-[7px] md:text-[9px] text-rose-200/85 font-medium">
                    {formatCurrency(space.taxAmount)}
                  </div>
                )}
              </div>

              {propertyState?.isMortgaged && (
                <div className="absolute inset-0 z-20 bg-slate-950/70 flex items-center justify-center">
                  <span className="rounded-full border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[8px] font-bold tracking-[0.2em] text-rose-200">
                    MORTGAGED
                  </span>
                </div>
              )}

              {spacePlayers.length > 0 && (
                <div className="absolute bottom-1 left-1 right-1 z-20 flex flex-wrap justify-center gap-1">
                  {spacePlayers.map((player) => (
                    <div
                      key={player.playerId}
                      className="player-coin animate-token-hop"
                      style={{
                        ["--coin-color" as string]: player.color,
                      }}
                      title={player.name}
                    >
                      <span>{PLAYER_TOKENS[player.turnOrder] || "●"}</span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DiceFace({
  value,
  rolling,
}: {
  value: number;
  rolling: boolean;
}) {
  const pipMap: Record<number, number[]> = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  return (
    <div className={`dice-cube ${rolling ? "animate-dice-tumble" : ""}`}>
      <div className="grid grid-cols-3 grid-rows-3 gap-1 w-full h-full">
        {Array.from({ length: 9 }, (_, index) => {
          const pipIndex = index + 1;
          const active = pipMap[value]?.includes(pipIndex);
          return (
            <span
              key={pipIndex}
              className={`rounded-full transition-all duration-150 ${
                active ? "bg-slate-900 shadow-[0_0_10px_rgba(15,23,42,0.35)]" : "bg-transparent"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
