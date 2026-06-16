"use client";

import { useState } from "react";
import { BOARD_SPACES, COLOR_GROUP_CSS } from "@/lib/monopoly-data";
import { formatCurrency } from "@/lib/formatters";
import type { PlayerData } from "@/lib/types";
import {
  canBuildHouse,
  canMortgageProperty,
  canSellHouse,
  canTradeProperty,
  type GameState,
} from "@/lib/game-engine";

interface GameControlsProps {
  roomId: string;
  playerId: string;
  players: PlayerData[];
  isMyTurn: boolean;
  currentPlayer: PlayerData | null;
  gameState: GameState;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  loading: boolean;
}

export default function GameControls({
  roomId,
  playerId,
  players,
  isMyTurn,
  currentPlayer,
  gameState,
  onAction,
  loading,
}: GameControlsProps) {
  const [showProperties, setShowProperties] = useState(false);
  const [showTradePanel, setShowTradePanel] = useState(false);
  const [customBid, setCustomBid] = useState("");
  const [tradeTargetPlayerId, setTradeTargetPlayerId] = useState("");
  const [offerCash, setOfferCash] = useState("0");
  const [requestCash, setRequestCash] = useState("0");
  const [offeredPropertyIndexes, setOfferedPropertyIndexes] = useState<number[]>([]);
  const [requestedPropertyIndexes, setRequestedPropertyIndexes] = useState<number[]>([]);
  const [selectedTripleSpace, setSelectedTripleSpace] = useState("0");

  if (!currentPlayer || !gameState) return null;

  const phase = gameState.phase;
  const myProperties = gameState.properties?.filter(
    (p) => p.ownerId === playerId
  ) ?? [];

  const currentSpace = BOARD_SPACES[currentPlayer.position];
  const pendingAuction = gameState.pendingAuction;
  const auctionSpace = pendingAuction
    ? BOARD_SPACES[pendingAuction.spaceIndex]
    : null;
  const auctionLeader = pendingAuction?.currentLeaderPlayerId
    ? players.find((player) => player.playerId === pendingAuction.currentLeaderPlayerId)
    : null;
  const viewerPassedAuction = Boolean(
    pendingAuction?.passedPlayerIds.includes(playerId)
  );
  const pendingTrade = gameState.pendingTrade;
  const tradeFromPlayer = pendingTrade
    ? players.find((player) => player.playerId === pendingTrade.fromPlayerId)
    : null;
  const tradeToPlayer = pendingTrade
    ? players.find((player) => player.playerId === pendingTrade.toPlayerId)
    : null;
  const availableTradePlayers = players.filter(
    (player) => player.playerId !== playerId && !player.isBankrupt
  );
  const selectedTradePlayer =
    availableTradePlayers.find((player) => player.playerId === tradeTargetPlayerId) ??
    null;
  const selectedTradePlayerProperties = gameState.properties.filter(
    (property) =>
      property.ownerId === selectedTradePlayer?.playerId &&
      canTradeProperty(gameState, selectedTradePlayer.playerId, property.spaceIndex)
  );
  const tradableMyProperties = myProperties.filter((property) =>
    canTradeProperty(gameState, playerId, property.spaceIndex)
  );
  const parsedOfferCash = Number.parseInt(offerCash || "0", 10) || 0;
  const parsedRequestCash = Number.parseInt(requestCash || "0", 10) || 0;
  const selectedTripleSpaceIndex = Number.parseInt(selectedTripleSpace, 10);

  // Check if player can build on any property
  const buildableProperties = myProperties.filter((prop) =>
    canBuildHouse(gameState, playerId, prop.spaceIndex)
  );

  function togglePropertySelection(
    propertyIndex: number,
    setter: React.Dispatch<React.SetStateAction<number[]>>
  ) {
    setter((current) =>
      current.includes(propertyIndex)
        ? current.filter((entry) => entry !== propertyIndex)
        : [...current, propertyIndex]
    );
  }

  return (
    <div className="space-y-3">
      {/* Current space info */}
      {isMyTurn && (
        <div className="premium-card p-3">
          <div className="text-xs text-amber-300/80 uppercase tracking-[0.25em] mb-1">
            Your Position
          </div>
          <div className="font-bold text-sm text-amber-50">{currentSpace?.name}</div>
        </div>
      )}

      {phase === "auction" && pendingAuction && auctionSpace && (
        <div className="premium-card p-3 space-y-3">
          <div>
            <div className="text-xs text-amber-300/80 uppercase tracking-[0.25em]">
              Live Auction
            </div>
            <div className="font-bold text-amber-50 text-sm mt-1">
              {auctionSpace.name}
            </div>
            <div className="text-xs text-amber-100/80 mt-1">
              Current bid: {formatCurrency(pendingAuction.currentBid)}
            </div>
            <div className="text-xs text-emerald-200/80 mt-1">
              Leader: {auctionLeader?.name ?? "No bids yet"}
            </div>
            <div className="text-[11px] text-amber-100/65 mt-1">
              {isMyTurn
                ? "Raise the bid or pass once you are out."
                : "Watch the auction. You can still bid if you have not passed."}
            </div>
          </div>

          {!viewerPassedAuction ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {[10, 50, 100].map((step) => {
                  const nextBid = pendingAuction.currentBid + step;
                  return (
                    <button
                      key={step}
                      onClick={() => onAction("bid-auction", { bidAmount: nextBid })}
                      disabled={loading || currentPlayer.money < nextBid}
                      className="py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-bold disabled:opacity-50 transition-all"
                    >
                      {formatCurrency(nextBid)}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={pendingAuction.currentBid + 1}
                  step={10}
                  value={customBid}
                  onChange={(event) => setCustomBid(event.target.value)}
                  placeholder={`${pendingAuction.currentBid + 10}`}
                  className="flex-1 rounded-lg border border-amber-500/20 bg-slate-900/70 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-400"
                />
                <button
                  onClick={() =>
                    onAction("bid-auction", {
                      bidAmount: Number.parseInt(customBid || "0", 10),
                    })
                  }
                  disabled={
                    loading ||
                    !customBid ||
                    currentPlayer.money < (Number.parseInt(customBid || "0", 10) || 0)
                  }
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold disabled:opacity-50 transition-all"
                >
                  Custom Bid
                </button>
              </div>
              <button
                onClick={() => onAction("pass-auction")}
                disabled={
                  loading ||
                  pendingAuction.currentLeaderPlayerId === playerId
                }
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium disabled:opacity-50 transition-all"
              >
                Pass Auction
              </button>
            </div>
          ) : (
            <div className="text-xs text-amber-200/80">
              You already passed on this auction.
            </div>
          )}
        </div>
      )}

      {isMyTurn && phase === "speed-die-choice" && gameState.pendingSpeedDie && (
        <div className="premium-card p-3 space-y-3">
          <div>
            <div className="text-xs text-amber-300/80 uppercase tracking-[0.25em]">
              Speed Die
            </div>
            <div className="font-bold text-amber-50 text-sm mt-1">
              {gameState.pendingSpeedDie.type === "bus-choice"
                ? "Choose Your Bus Move"
                : "Choose Any Board Space"}
            </div>
            <div className="text-xs text-emerald-100/75 mt-1">
              White dice: {gameState.pendingSpeedDie.whiteDice[0]} +{" "}
              {gameState.pendingSpeedDie.whiteDice[1]}
            </div>
          </div>

          {gameState.pendingSpeedDie.type === "bus-choice" ? (
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  label: `${gameState.pendingSpeedDie.whiteDice[0]} spaces`,
                  movementChoice: "die1",
                },
                {
                  label: `${gameState.pendingSpeedDie.whiteDice[1]} spaces`,
                  movementChoice: "die2",
                },
                {
                  label: `${gameState.pendingSpeedDie.whiteDice[0] + gameState.pendingSpeedDie.whiteDice[1]} spaces`,
                  movementChoice: "total",
                },
              ].map((option) => (
                <button
                  key={option.movementChoice}
                  onClick={() =>
                    onAction("choose-speed-die", {
                      movementChoice: option.movementChoice,
                    })
                  }
                  disabled={loading}
                  className="rounded-lg bg-blue-700 hover:bg-blue-600 px-2 py-3 text-xs font-bold text-white transition-all disabled:opacity-50"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <select
                value={selectedTripleSpace}
                onChange={(event) => setSelectedTripleSpace(event.target.value)}
                className="w-full rounded-lg border border-amber-500/20 bg-slate-900/70 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-400"
              >
                {BOARD_SPACES.map((space) => (
                  <option key={space.index} value={space.index}>
                    {space.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  onAction("choose-speed-die", {
                    spaceIndex: selectedTripleSpaceIndex,
                  })
                }
                disabled={loading || Number.isNaN(selectedTripleSpaceIndex)}
                className="w-full rounded-lg bg-purple-700 hover:bg-purple-600 px-3 py-2.5 text-sm font-bold text-white transition-all disabled:opacity-50"
              >
                Move To {BOARD_SPACES[selectedTripleSpaceIndex]?.name ?? "Selected Space"}
              </button>
            </div>
          )}
        </div>
      )}

      {pendingTrade && tradeFromPlayer && tradeToPlayer && (
        <div className="premium-card p-3 space-y-3">
          <div>
            <div className="text-xs text-amber-300/80 uppercase tracking-[0.25em]">
              Trade Offer
            </div>
            <div className="text-sm font-bold text-amber-50 mt-1">
              {tradeFromPlayer.name} → {tradeToPlayer.name}
            </div>
          </div>
          <div className="text-xs text-emerald-100/80 space-y-1">
            <div>
              Offers: {pendingTrade.offerCash > 0 ? formatCurrency(pendingTrade.offerCash) : "No cash"}
              {pendingTrade.offeredPropertyIndexes.length > 0
                ? ` + ${pendingTrade.offeredPropertyIndexes
                    .map((spaceIndex) => BOARD_SPACES[spaceIndex]?.name)
                    .join(", ")}`
                : ""}
            </div>
            <div>
              Wants: {pendingTrade.requestCash > 0 ? formatCurrency(pendingTrade.requestCash) : "No cash"}
              {pendingTrade.requestedPropertyIndexes.length > 0
                ? ` + ${pendingTrade.requestedPropertyIndexes
                    .map((spaceIndex) => BOARD_SPACES[spaceIndex]?.name)
                    .join(", ")}`
                : ""}
            </div>
          </div>
          {pendingTrade.toPlayerId === playerId ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onAction("accept-trade")}
                disabled={loading}
                className="py-2.5 rounded-lg bg-green-600 hover:bg-green-500 font-bold text-sm disabled:opacity-50 transition-all"
              >
                Accept
              </button>
              <button
                onClick={() => onAction("reject-trade")}
                disabled={loading}
                className="py-2.5 rounded-lg bg-rose-700 hover:bg-rose-600 font-bold text-sm disabled:opacity-50 transition-all"
              >
                Reject
              </button>
            </div>
          ) : pendingTrade.fromPlayerId === playerId ? (
            <button
              onClick={() => onAction("cancel-trade")}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 font-medium text-sm disabled:opacity-50 transition-all"
            >
              Cancel Trade
            </button>
          ) : (
            <div className="text-xs text-amber-200/75">
              Waiting for {tradeToPlayer.name} to respond.
            </div>
          )}
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
              💵 Pay {formatCurrency(50)} to Leave
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
                  Price: {formatCurrency(currentSpace.price)} | Rent: {formatCurrency(currentSpace.rent?.[0] || 0)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onAction("buy-property")}
                  disabled={loading || currentPlayer.money < currentSpace.price}
                  className="py-2.5 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
                >
                  Buy {formatCurrency(currentSpace.price)}
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
      {!isMyTurn && phase !== "game-over" && phase !== "auction" && (
        <div className="text-center py-4 text-emerald-400/70 text-sm">
          {phase === "trade-response"
            ? "⏳ Waiting on a trade response..."
            : "⏳ Waiting for other player&apos;s turn..."}
        </div>
      )}

      {isMyTurn && phase !== "auction" && phase !== "buy-decision" && !pendingTrade && (
        <div>
          <button
            onClick={() => setShowTradePanel((current) => !current)}
            className="w-full py-2 text-sm text-amber-300 hover:text-amber-200 transition-colors flex items-center justify-center gap-1"
          >
            🤝 Trade Center
            <span className="text-xs">{showTradePanel ? "▲" : "▼"}</span>
          </button>

          {showTradePanel && (
            <div className="premium-card p-3 mt-2 space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-[0.2em] text-amber-300/75">
                  Trade With
                </label>
                <select
                  value={tradeTargetPlayerId}
                  onChange={(event) => {
                    setTradeTargetPlayerId(event.target.value);
                    setRequestedPropertyIndexes([]);
                  }}
                  className="mt-1 w-full rounded-lg border border-amber-500/20 bg-slate-900/70 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-400"
                >
                  <option value="">Select player</option>
                  {availableTradePlayers.map((player) => (
                    <option key={player.playerId} value={player.playerId}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-amber-300/75">
                    You Offer Cash
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={offerCash}
                    onChange={(event) => setOfferCash(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-amber-500/20 bg-slate-900/70 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.2em] text-amber-300/75">
                    You Request Cash
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={requestCash}
                    onChange={(event) => setRequestCash(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-amber-500/20 bg-slate-900/70 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {tradableMyProperties.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300/75 mb-2">
                    Your Tradable Properties
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tradableMyProperties.map((property) => (
                      <button
                        key={property.spaceIndex}
                        onClick={() =>
                          togglePropertySelection(
                            property.spaceIndex,
                            setOfferedPropertyIndexes
                          )
                        }
                        type="button"
                        className={`px-2 py-1.5 rounded-full text-xs border transition-all ${
                          offeredPropertyIndexes.includes(property.spaceIndex)
                            ? "bg-amber-500 text-gray-950 border-amber-300"
                            : "bg-slate-900/70 text-amber-100 border-amber-500/20"
                        }`}
                      >
                        {BOARD_SPACES[property.spaceIndex].name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedTradePlayer && selectedTradePlayerProperties.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300/75 mb-2">
                    {selectedTradePlayer.name}&apos;s Tradable Properties
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedTradePlayerProperties.map((property) => (
                      <button
                        key={property.spaceIndex}
                        onClick={() =>
                          togglePropertySelection(
                            property.spaceIndex,
                            setRequestedPropertyIndexes
                          )
                        }
                        type="button"
                        className={`px-2 py-1.5 rounded-full text-xs border transition-all ${
                          requestedPropertyIndexes.includes(property.spaceIndex)
                            ? "bg-emerald-500 text-gray-950 border-emerald-300"
                            : "bg-slate-900/70 text-emerald-100 border-emerald-500/20"
                        }`}
                      >
                        {BOARD_SPACES[property.spaceIndex].name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() =>
                  onAction("propose-trade", {
                    toPlayerId: tradeTargetPlayerId,
                    offerCash: parsedOfferCash,
                    requestCash: parsedRequestCash,
                    offeredPropertyIndexes,
                    requestedPropertyIndexes,
                  })
                }
                disabled={loading || !tradeTargetPlayerId}
                className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 font-bold text-sm disabled:opacity-50 transition-all"
              >
                Send Trade Offer
              </button>
            </div>
          )}
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
                const canMortgage = canMortgageProperty(
                  gameState,
                  playerId,
                  prop.spaceIndex
                );
                const canSell = canSellHouse(
                  gameState,
                  playerId,
                  prop.spaceIndex
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
                          title={`Build ${formatCurrency(space.houseCost || 0)}`}
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
                          disabled={loading || !canSell}
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
                          disabled={loading || !canMortgage}
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
