"use client";

import { useRef, useEffect } from "react";
import type { LogEntry } from "@/lib/types";

interface GameLogProps {
  logs: LogEntry[];
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
              className="text-xs text-emerald-200/80 py-0.5 animate-slide-in"
            >
              {log.action}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
