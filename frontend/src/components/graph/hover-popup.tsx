"use client";

import React from "react";

interface HoverPopupProps {
  node: {
    id: string;
    label: string;
    type: string;
    size?: number;
    year?: number | null;
    theme?: string | null;
    paperCount?: number | null;
    isSeed?: boolean;
  };
  position: { x: number; y: number };
}

const TYPE_COLORS: Record<string, { badgeClass: string; label: string }> = {
  paper: { badgeClass: "bg-sky-100 text-sky-700 border-sky-200", label: "Paper" },
  mechanism: { badgeClass: "bg-amber-100 text-amber-700 border-amber-200", label: "Mechanism" },
  method: { badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Method" },
  dataset: { badgeClass: "bg-violet-100 text-violet-700 border-violet-200", label: "Dataset" },
  puzzle: { badgeClass: "bg-rose-100 text-rose-700 border-rose-200", label: "Puzzle" },
};

export function HoverPopup({ node, position }: HoverPopupProps) {
  const typeConfig = TYPE_COLORS[node.type] ?? {
    badgeClass: "bg-muted text-foreground border-border",
    label: node.type,
  };

  const isPaper = node.type === "paper";

  // Clamp position so popup doesn't clip off-screen
  const popupWidth = 240;
  const popupMargin = 20;
  const clampedX = Math.min(position.x + 15, (typeof window !== "undefined" ? window.innerWidth : 1200) - popupWidth - popupMargin);
  const clampedY = Math.max(position.y - 10, 10);

  return (
    <div
      className="pointer-events-none fixed z-[9999]"
      style={{
        left: clampedX,
        top: clampedY,
      }}
    >
      <div className="paper-panel w-[240px] rounded-[1.2rem] border border-border/75 bg-background/95 p-3.5 shadow-[0_18px_44px_rgba(44,51,71,0.16)]">
        {/* Type badge */}
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${typeConfig.badgeClass}`}
        >
          {typeConfig.label}
        </span>

        {/* Full title */}
        <p className="mt-2 text-sm font-semibold leading-snug text-foreground">
          {node.label}
        </p>

        {/* Metadata */}
        <div className="mt-2 space-y-1">
          {isPaper && node.size != null && (
            <p className="text-xs text-muted-foreground">
              Score: {node.size}
            </p>
          )}
          {!isPaper && node.size != null && (
            <p className="text-xs text-muted-foreground">
              Relevance: {node.size}
            </p>
          )}
          {node.year != null && (
            <p className="text-xs text-muted-foreground">
              Year: {node.year}
            </p>
          )}
          {node.theme && (
            <p className="text-xs text-muted-foreground">
              Theme: {node.theme}
            </p>
          )}
          {node.paperCount != null && (
            <p className="text-xs text-muted-foreground">
              Linked papers: {node.paperCount}
            </p>
          )}
          {node.isSeed && (
            <p className="text-xs font-medium text-primary">
              Seed node
            </p>
          )}
          <p className="font-mono text-[11px] text-muted-foreground/80">
            ID: {node.id}
          </p>
        </div>

        {/* Hint */}
        <p className="mt-2 border-t border-border/75 pt-2 text-[11px] text-muted-foreground/80">
          Click to select &middot; Double-click to expand
        </p>
      </div>
    </div>
  );
}
