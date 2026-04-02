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
  if (value >= 4) return "bg-gradient-to-r from-gray-200 to-green-500";
  if (value >= 3) return "bg-gradient-to-r from-gray-200 to-blue-500";
  if (value >= 2) return "bg-gradient-to-r from-gray-200 to-yellow-500";
  return "bg-gradient-to-r from-gray-200 to-gray-400";
}

function scoreTextColor(value: number): string {
  if (value >= 4) return "text-green-700";
  if (value >= 3) return "text-blue-700";
  if (value >= 2) return "text-yellow-700";
  return "text-gray-500";
}

export function ScoreBar({ label, value, max = 5 }: ScoreBarProps) {
  const displayValue = value ?? 0;
  const percentage = Math.min((displayValue / max) * 100, 100);

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100/80">
        <div
          className={`h-full rounded-full transition-all ${value !== null ? scoreColor(value) : "bg-gray-300"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span
        className={`w-8 text-right text-xs font-semibold ${value !== null ? scoreTextColor(value) : "text-gray-400"}`}
      >
        {value !== null ? value.toFixed(1) : "--"}
      </span>
    </div>
  );
}
