"use client";

import { useRef, useEffect } from "react";
import { BOARD_SPACES } from "@/lib/monopoly-data";
import { formatCurrency } from "@/lib/formatters";
import type { LogEntry } from "@/lib/types";

interface GameLogProps {
  logs: LogEntry[];
}

function getDetailNumber(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key];
  return typeof value === "number" ? value : null;
}

function getDetailString(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value : null;
}

function getDetailStringArray(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function renderLogDetails(log: LogEntry) {
  const type = getDetailString(log.details, "type");

  if (type === "trade") {
    const status = getDetailString(log.details, "status");
    const offerCash = getDetailNumber(log.details, "offerCash") ?? 0;
    const requestCash = getDetailNumber(log.details, "requestCash") ?? 0;
    const offeredNames = getDetailStringArray(log.details, "offeredPropertyNames");
    const requestedNames = getDetailStringArray(log.details, "requestedPropertyNames");
    const fromPlayerName = getDetailString(log.details, "fromPlayerName") ?? "Unknown";
    const toPlayerName = getDetailString(log.details, "toPlayerName") ?? "Unknown";

    const offerParts = [
      offerCash > 0 ? formatCurrency(offerCash) : null,
      offeredNames.length > 0 ? offeredNames.join(", ") : null,
    ].filter(Boolean);
    const requestParts = [
      requestCash > 0 ? formatCurrency(requestCash) : null,
      requestedNames.length > 0 ? requestedNames.join(", ") : null,
    ].filter(Boolean);

    return (
      <div className="mt-1 rounded-lg bg-emerald-950/45 px-2 py-1.5 text-[11px] text-emerald-100/80">
        <div className="font-semibold text-amber-100/90">
          {fromPlayerName} {"->"} {toPlayerName} ({status ?? "pending"})
        </div>
        <div className="mt-1">Offer: {offerParts.join(" + ") || "Nothing"}</div>
        <div>Request: {requestParts.join(" + ") || "Nothing"}</div>
      </div>
    );
  }

  if (type === "speed-die") {
    const face = getDetailString(log.details, "face");
    const choice = getDetailString(log.details, "choice");
    const optionsValue = log.details?.options;
    const options = Array.isArray(optionsValue)
      ? optionsValue.filter((entry): entry is number => typeof entry === "number")
      : [];
    const destinationSpaceIndex = getDetailNumber(log.details, "destinationSpaceIndex");

    return (
      <div className="mt-1 rounded-lg bg-sky-950/40 px-2 py-1.5 text-[11px] text-sky-100/80">
        <div>
          Face:{" "}
          <span className="font-semibold text-sky-50">
            {face ?? "pending"}
          </span>
        </div>
        {choice && <div>Choice: {choice}</div>}
        {options.length > 0 && <div>Options: {options.join(" / ")}</div>}
        {destinationSpaceIndex !== null && (
          <div>
            Destination: {BOARD_SPACES[destinationSpaceIndex]?.name ?? "Unknown"}
          </div>
        )}
      </div>
    );
  }

  if (type === "bankruptcy") {
    const creditor = getDetailString(log.details, "creditor");
    const liquidationValue = getDetailNumber(log.details, "liquidationValue");
    const mortgageInterestDue = getDetailNumber(log.details, "mortgageInterestDue");
    const transferredPropertyCount = getDetailNumber(
      log.details,
      "transferredPropertyCount"
    );

    return (
      <div className="mt-1 rounded-lg bg-rose-950/40 px-2 py-1.5 text-[11px] text-rose-100/80">
        {creditor && <div>Creditor: {creditor}</div>}
        {typeof transferredPropertyCount === "number" && (
          <div>Properties affected: {transferredPropertyCount}</div>
        )}
        {typeof liquidationValue === "number" && liquidationValue > 0 && (
          <div>Buildings liquidated: {formatCurrency(liquidationValue)}</div>
        )}
        {typeof mortgageInterestDue === "number" && mortgageInterestDue > 0 && (
          <div>Mortgage interest due: {formatCurrency(mortgageInterestDue)}</div>
        )}
      </div>
    );
  }

  return null;
}

export default function GameLog({ logs }: GameLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-emerald-900/40 rounded-xl border border-emerald-700/50 overflow-hidden">
      <div className="px-3 py-2 border-b border-emerald-700/50">
        <h3 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
          📜 Game Log
        </h3>
      </div>
      <div
        ref={scrollRef}
        className="h-32 md:h-48 overflow-y-auto custom-scrollbar p-2 space-y-1"
      >
        {logs.length === 0 ? (
          <p className="text-emerald-600 text-xs text-center py-4">
            No activity yet...
          </p>
        ) : (
          logs.map((log, i) => (
            <div
              key={log.id || i}
              className="py-0.5 animate-slide-in"
            >
              <div className="text-xs text-emerald-200/80">{log.action}</div>
              {renderLogDetails(log)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
