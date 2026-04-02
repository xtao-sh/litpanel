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

const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  paper: { bg: "#dbeafe", text: "#1e40af", label: "Paper" },
  mechanism: { bg: "#ffedd5", text: "#9a3412", label: "Mechanism" },
  method: { bg: "#dcfce7", text: "#166534", label: "Method" },
  dataset: { bg: "#f3e8ff", text: "#6b21a8", label: "Dataset" },
  puzzle: { bg: "#fee2e2", text: "#991b1b", label: "Puzzle" },
};

export function HoverPopup({ node, position }: HoverPopupProps) {
  const typeConfig = TYPE_COLORS[node.type] ?? {
    bg: "#f3f4f6",
    text: "#374151",
    label: node.type,
  };

  const isPaper = node.type === "paper";

  return (
    <div
      className="pointer-events-none fixed z-[9999]"
      style={{
        left: position.x + 15,
        top: position.y - 10,
      }}
    >
      <div className="w-[220px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
        {/* Type badge */}
        <span
          className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
          style={{ backgroundColor: typeConfig.bg, color: typeConfig.text }}
        >
          {typeConfig.label}
        </span>

        {/* Full title */}
        <p className="mt-1.5 text-xs font-semibold leading-snug text-gray-900">
          {node.label}
        </p>

        {/* Metadata */}
        <div className="mt-1.5 space-y-0.5">
          {isPaper && node.size != null && (
            <p className="text-xs text-gray-500">
              Score: {node.size}
            </p>
          )}
          {!isPaper && node.size != null && (
            <p className="text-xs text-gray-500">
              Relevance: {node.size}
            </p>
          )}
          {node.year != null && (
            <p className="text-xs text-gray-500">
              Year: {node.year}
            </p>
          )}
          {node.theme && (
            <p className="text-xs text-gray-500">
              Theme: {node.theme}
            </p>
          )}
          {node.paperCount != null && (
            <p className="text-xs text-gray-500">
              Linked papers: {node.paperCount}
            </p>
          )}
          {node.isSeed && (
            <p className="text-xs font-medium text-blue-600">
              Seed node
            </p>
          )}
          <p className="text-xs text-gray-400">
            ID: {node.id}
          </p>
        </div>

        {/* Hint */}
        <p className="mt-2 border-t border-gray-100 pt-1.5 text-xs text-gray-400">
          Click to select &middot; Double-click to expand
        </p>
      </div>
    </div>
  );
}
