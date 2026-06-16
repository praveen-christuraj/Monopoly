"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOARD_SPACES, COLOR_GROUP_CSS, PLAYER_TOKENS } from "@/lib/monopoly-data";
import { formatCurrency } from "@/lib/formatters";
import type { LogEntry, PlayerData } from "@/lib/types";
import type { GameState, PropertyState } from "@/lib/game-engine";

interface GameBoardProps {
  players: PlayerData[];
  gameState: GameState;
  logs: LogEntry[];
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

function getDetailString(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value : null;
}

function getDetailNumber(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key];
  return typeof value === "number" ? value : null;
}

type BoardEventTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "auction"
  | "card";

interface BoardEvent {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  tone: BoardEventTone;
  spaceIndex: number | null;
}

function getPhaseGuide(gameState: GameState) {
  switch (gameState.phase) {
    case "roll":
      return {
        title: "Roll To Move",
        subtitle: "Use the dice to start your turn and trigger the next board action.",
      };
    case "buy-decision":
      return {
        title: "Property Decision",
        subtitle: "Buy the city you landed on or pass and let the auction begin.",
      };
    case "auction":
      return {
        title: "Auction Live",
        subtitle: "Watch the leading bid and raise or pass before the city is claimed.",
      };
    case "trade-response":
      return {
        title: "Trade Pending",
        subtitle: "Review the offer summary and accept, reject, or cancel it clearly.",
      };
    case "speed-die-choice":
      return {
        title: "Resolve Speed Die",
        subtitle: "Pick the bus route, free destination, or bonus move shown on the board.",
      };
    case "end-turn":
      return {
        title: "Turn Ready To End",
        subtitle: "Finish any final management actions, then pass play to the next player.",
      };
    default:
      return {
        title: "Manage Your Turn",
        subtitle: "Build, mortgage, trade, or inspect the board to plan your next move.",
      };
  }
}

function getLatestBoardEvent(logs: LogEntry[], players: PlayerData[]): BoardEvent | null {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const log = logs[index];
    const type = getDetailString(log.details, "type");

    if (type === "buy-property") {
      const propertyName = getDetailString(log.details, "propertyName") ?? "Property";
      const amount = getDetailNumber(log.details, "amount") ?? 0;
      return {
        id: log.id,
        icon: "HOME",
        title: `${propertyName} Purchased`,
        subtitle: `${getDetailString(log.details, "playerName") ?? "A player"} paid ${formatCurrency(amount)} to claim it.`,
        tone: "success",
        spaceIndex: getDetailNumber(log.details, "spaceIndex"),
      };
    }

    if (type === "go-salary") {
      const amount = getDetailNumber(log.details, "amount") ?? 0;
      return {
        id: log.id,
        icon: "GO",
        title: "Passed GO",
        subtitle: `Salary collected: ${formatCurrency(amount)}.`,
        tone: "success",
        spaceIndex: 0,
      };
    }

    if (type === "tax") {
      return {
        id: log.id,
        icon: "TAX",
        title: "Tax Due",
        subtitle: `Bank payment: ${formatCurrency(getDetailNumber(log.details, "amount") ?? 0)}.`,
        tone: "warning",
        spaceIndex: null,
      };
    }

    if (type === "jail") {
      const status = getDetailString(log.details, "status");
      return {
        id: log.id,
        icon: "JAIL",
        title:
          status === "paid-release"
            ? "Jail Fee Paid"
            : status === "card-release"
            ? "Jail Card Used"
            : "Sent To Jail",
        subtitle:
          status === "paid-release"
            ? `Release fee paid: ${formatCurrency(getDetailNumber(log.details, "amount") ?? 0)}.`
            : status === "card-release"
            ? "A Get Out of Jail Free card was spent."
            : "Movement stops and the turn ends immediately.",
        tone: "danger",
        spaceIndex: getDetailNumber(log.details, "spaceIndex") ?? 10,
      };
    }

    if (type === "card") {
      const deck = getDetailString(log.details, "deck");
      return {
        id: log.id,
        icon: deck === "chance" ? "CH?" : "CC",
        title: deck === "chance" ? "Chance Card" : "Community Chest",
        subtitle: getDetailString(log.details, "text") ?? log.action,
        tone: "card",
        spaceIndex: null,
      };
    }

    if (type === "auction-bid") {
      const propertyName = getDetailString(log.details, "propertyName") ?? "Property";
      return {
        id: log.id,
        icon: "BID",
        title: "New Auction Bid",
        subtitle: `${getDetailString(log.details, "playerName") ?? "A player"} raised ${propertyName} to ${formatCurrency(getDetailNumber(log.details, "amount") ?? 0)}.`,
        tone: "auction",
        spaceIndex: getDetailNumber(log.details, "spaceIndex"),
      };
    }

    if (type === "auction-win") {
      const propertyName = getDetailString(log.details, "propertyName") ?? "Property";
      return {
        id: log.id,
        icon: "WIN",
        title: "Auction Won",
        subtitle: `${getDetailString(log.details, "playerName") ?? "A player"} secured ${propertyName} for ${formatCurrency(getDetailNumber(log.details, "amount") ?? 0)}.`,
        tone: "auction",
        spaceIndex: getDetailNumber(log.details, "spaceIndex"),
      };
    }

    if (type === "auction-end") {
      return {
        id: log.id,
        icon: "PASS",
        title: "Auction Closed",
        subtitle: `${getDetailString(log.details, "propertyName") ?? "Property"} ended without a winning bid.`,
        tone: "auction",
        spaceIndex: getDetailNumber(log.details, "spaceIndex"),
      };
    }

    if (type === "rent") {
      const creditorId = getDetailString(log.details, "creditorPlayerId");
      const creditorName =
        players.find((player) => player.playerId === creditorId)?.name ?? "another owner";
      return {
        id: log.id,
        icon: "RENT",
        title: "Rent Paid",
        subtitle: `${formatCurrency(getDetailNumber(log.details, "amount") ?? 0)} paid to ${creditorName}.`,
        tone: "info",
        spaceIndex: null,
      };
    }

    if (type === "bankruptcy") {
      const creditor = getDetailString(log.details, "creditor");
      return {
        id: log.id,
        icon: "OUT",
        title: "Bankruptcy",
        subtitle: creditor
          ? `Assets transferred while settling debt to ${creditor}.`
          : "Assets were liquidated and the player left the game.",
        tone: "danger",
        spaceIndex: null,
      };
    }
  }

  return null;
}

export default function GameBoard({
  players,
  gameState,
  logs,
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
  const latestBoardEvent = useMemo(() => getLatestBoardEvent(logs, players), [logs, players]);

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
  const phaseGuide = getPhaseGuide(gameState);
  const activeEvent = latestBoardEvent;

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
          <div className="absolute inset-[8%] board-city-scene pointer-events-none">
            <div className="city-ring-road city-ring-road-outer" />
            <div className="city-ring-road city-ring-road-inner" />
            <div className="city-park-core" />
            <div className="city-landmark city-landmark-north" />
            <div className="city-landmark city-landmark-east" />
            <div className="city-landmark city-landmark-south" />
            <div className="city-landmark city-landmark-west" />
            {[
              { left: "11%", top: "16%", height: "24%", tone: "#f97316" },
              { left: "22%", top: "10%", height: "34%", tone: "#ef4444" },
              { left: "33%", top: "18%", height: "27%", tone: "#94a3b8" },
              { left: "58%", top: "12%", height: "36%", tone: "#facc15" },
              { left: "70%", top: "18%", height: "30%", tone: "#22c55e" },
              { left: "77%", top: "28%", height: "22%", tone: "#06b6d4" },
              { left: "16%", top: "58%", height: "20%", tone: "#ec4899" },
              { left: "28%", top: "68%", height: "28%", tone: "#7dd3fc" },
              { left: "47%", top: "64%", height: "26%", tone: "#cbd5e1" },
              { left: "63%", top: "62%", height: "22%", tone: "#38bdf8" },
            ].map((tower, index) => (
              <div
                key={`${tower.left}-${tower.top}-${index}`}
                className="city-tower"
                style={{
                  left: tower.left,
                  top: tower.top,
                  height: tower.height,
                  ["--tower-tone" as string]: tower.tone,
                }}
              />
            ))}
          </div>

          <div className="absolute inset-x-4 top-4 z-10 text-center">
            <p className="text-[10px] md:text-xs uppercase tracking-[0.55em] text-amber-200/70">
              India Edition
            </p>
            <h2 className="text-2xl md:text-5xl font-black tracking-[0.25em] text-amber-300 drop-shadow-[0_6px_20px_rgba(0,0,0,0.55)]">
              MONOPOLY
            </h2>
            <p className="text-[11px] md:text-sm text-emerald-100/80 mt-2">
              Metro skyline board • premium match table • rupee economy
            </p>
          </div>

          <div className="relative z-10 w-full h-full px-4 pt-24 pb-5 flex flex-col items-center justify-between">
            <div className="w-full max-w-[360px] space-y-3">
              {activeEvent && (
                <div className={`board-event-banner board-event-${activeEvent.tone}`}>
                  <div className={`board-event-icon board-event-icon-${activeEvent.tone}`}>
                    {activeEvent.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.35em] text-amber-200/70">
                      Latest Event
                    </div>
                    <div className="text-sm md:text-base font-black text-white mt-1">
                      {activeEvent.title}
                    </div>
                    <div className="text-[11px] md:text-xs text-emerald-50/85 mt-1 leading-relaxed">
                      {activeEvent.subtitle}
                    </div>
                  </div>
                </div>
              )}

            {gameState?.lastDice && (
              <div className="flex items-center justify-center gap-3">
                <DiceFace value={gameState.lastDice[0]} rolling={isRollingDice} />
                <DiceFace value={gameState.lastDice[1]} rolling={isRollingDice} />
              </div>
            )}

            {(gameState?.lastSpeedDie || gameState?.pendingSpeedDie) && (
              <div className="flex flex-wrap items-center justify-center gap-2">
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
              <div className="max-w-[280px] mx-auto premium-card p-3 text-left border border-amber-400/20">
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
              <div className="max-w-[320px] mx-auto premium-card p-3 text-left border border-emerald-400/20">
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
              <div className="max-w-[240px] mx-auto premium-card p-3 text-left board-card-flip">
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

            <div className="w-full max-w-[360px] space-y-3">
              <div className="premium-card p-3 text-left">
                <div className="text-[10px] uppercase tracking-[0.35em] text-emerald-300/80">
                  What Happens Now
                </div>
                <div className="text-sm font-bold text-amber-50 mt-1">
                  {phaseGuide.title}
                </div>
                <div className="text-[11px] md:text-xs text-emerald-100/80 mt-1 leading-relaxed">
                  {phaseGuide.subtitle}
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2 text-[10px] md:text-[11px]">
                <span className="board-help-pill">Tap any tile to inspect it</span>
                <span className="board-help-pill">Colored dot = owner</span>
                <span className="board-help-pill">H / HOTEL = buildings</span>
                <span className="board-help-pill">BID / OFFER / WANT = live actions</span>
              </div>
            </div>
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
          const isEventSpace = activeEvent?.spaceIndex === space.index;

          return (
            <button
              key={space.index}
              type="button"
              onClick={() => onSpaceClick?.(space.index)}
              className={`relative overflow-hidden board-tile text-left transition-transform duration-200 hover:scale-[1.02] ${
                isAuctionSpace
                  ? "ring-2 ring-amber-300/80 shadow-[0_0_18px_rgba(251,191,36,0.35)]"
                  : isEventSpace
                  ? "ring-2 ring-cyan-200/80 shadow-[0_0_22px_rgba(103,232,249,0.42)]"
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

              {isEventSpace && !isAuctionSpace && (
                <div className="absolute bottom-1 right-1 z-20 rounded-full bg-cyan-300/90 px-1.5 py-0.5 text-[8px] font-black tracking-[0.15em] text-slate-950 animate-pulse">
                  LIVE
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
                  <div className="text-[7px] md:text-[9px] font-semibold tracking-[0.24em] text-emerald-900/55 uppercase">
                    {getSpaceIcon(space)}
                  </div>
                  <div className={`${isCorner ? "text-[9px] md:text-xs" : "text-[7px] md:text-[9px]"} font-semibold text-emerald-950/90 leading-tight mt-1`}>
                    {space.name}
                  </div>
                </div>

                {(space.type === "property" || space.type === "railroad" || space.type === "utility") &&
                  space.price && (
                    <div className="text-[7px] md:text-[9px] text-emerald-950/75 font-bold">
                      {formatCurrency(space.price)}
                    </div>
                  )}

                {space.type === "tax" && space.taxAmount && (
                  <div className="text-[7px] md:text-[9px] text-rose-700/90 font-bold">
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
