"use client";

import React from "react";

// ---------------------------------------------------------------------------
// Score bar: horizontal bar visualization for 1-5 scale
// ---------------------------------------------------------------------------

interface ScoreBarProps {
  label: string;
  value: number | null;
  max?: number;
}

function scoreColor(value: number): string {
  if (value >= 4) return "bg-gradient-to-r from-[var(--paper-3)] to-[var(--forest)]";
  if (value >= 3) return "bg-gradient-to-r from-[var(--paper-3)] to-[#2c4870]";
  if (value >= 2) return "bg-gradient-to-r from-[var(--paper-3)] to-[#b88a3b]";
  return "bg-gradient-to-r from-[var(--paper-3)] to-[var(--ink-5)]";
}

function scoreTextColor(value: number): string {
  if (value >= 4) return "text-[var(--forest-2)]";
  if (value >= 3) return "text-[#223a5e]";
  if (value >= 2) return "text-[#7a5a18]";
  return "text-[var(--ink-4)]";
}

export function ScoreBar({ label, value, max = 5 }: ScoreBarProps) {
  const displayValue = value ?? 0;
  const percentage = Math.min((displayValue / max) * 100, 100);

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs font-medium text-[var(--ink-4)]">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--paper-2)]/80">
        <div
          className={`h-full rounded-full transition-all ${value !== null ? scoreColor(value) : "bg-[var(--line)]"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span
        className={`w-8 text-right text-xs font-semibold ${value !== null ? scoreTextColor(value) : "text-[var(--ink-5)]"}`}
      >
        {value !== null ? value.toFixed(1) : "--"}
      </span>
    </div>
  );
}
