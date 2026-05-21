"use client";

import React from "react";
import { useI18n } from "@/lib/i18n/locale-context";

interface HoverPopupProps {
  node: {
    id: string;
    label: string;
    type: string;
    size?: number;
    year?: number | null;
    theme?: string | null;
    paperCount?: number | null;
    visiblePaperCount?: number | null;
    isSeed?: boolean;
  };
  position: { x: number; y: number };
}

const TYPE_COLORS: Record<string, { badgeClass: string; labelKey: string }> = {
  paper: { badgeClass: "bg-[#e9eef6] text-[#223a5e] border-[#bccbe0]", labelKey: "graph.nodeTypes.paper" },
  mechanism: { badgeClass: "bg-[#f4ead8] text-[#7a5a18] border-[#d6b678]", labelKey: "graph.nodeTypes.mechanism" },
  method: { badgeClass: "bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]", labelKey: "graph.nodeTypes.method" },
  dataset: { badgeClass: "bg-[#e9eef6] text-[#223a5e] border-[#bccbe0]", labelKey: "graph.nodeTypes.dataset" },
  puzzle: { badgeClass: "bg-[#f4dfd5] text-[#8a3318] border-[#da9a80]", labelKey: "graph.nodeTypes.puzzle" },
};

export function HoverPopup({ node, position }: HoverPopupProps) {
  const { t } = useI18n();
  const typeConfig = TYPE_COLORS[node.type] ?? {
    badgeClass: "bg-[var(--paper-2)] text-[var(--ink)] border-[var(--line-soft)]",
    labelKey: node.type,
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
      <div className="lp-card w-[240px] rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)]/95 p-3.5 shadow-[var(--shadow-2)]">
        {/* Type badge */}
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${typeConfig.badgeClass}`}
        >
          {t(typeConfig.labelKey)}
        </span>

        {/* Full title */}
        <p className="mt-2 text-sm font-semibold leading-snug text-[var(--ink)]">
          {node.label}
        </p>

        {/* Metadata */}
        <div className="mt-2 space-y-1">
          {isPaper && node.size != null && (
            <p className="text-xs text-[var(--ink-4)]">
              {t("graph.hover.score", { value: node.size })}
            </p>
          )}
          {!isPaper && node.size != null && (
            <p className="text-xs text-[var(--ink-4)]">
              {t("graph.hover.relevance", { value: node.size })}
            </p>
          )}
          {node.year != null && (
            <p className="text-xs text-[var(--ink-4)]">
              {t("graph.detail.year", { value: node.year })}
            </p>
          )}
          {node.theme && (
            <p className="text-xs text-[var(--ink-4)]">
              {t("graph.detail.theme", { value: node.theme })}
            </p>
          )}
          {node.paperCount != null && (
            <p className="text-xs text-[var(--ink-4)]">
              {node.visiblePaperCount != null && node.visiblePaperCount !== node.paperCount
                ? t("graph.detail.visibleLinkedPapers", {
                    visible: node.visiblePaperCount,
                    total: node.paperCount,
                  })
                : t("graph.detail.linkedPapers", { value: node.paperCount })}
            </p>
          )}
          {node.isSeed && (
            <p className="text-xs font-medium text-[var(--forest)]">
              {t("graph.detail.seed")}
            </p>
          )}
          <p className="font-mono text-[11px] text-[var(--ink-4)]/80">
            ID: {node.id}
          </p>
        </div>

        {/* Hint */}
        <p className="mt-2 border-t border-[var(--line-soft)] pt-2 text-[11px] text-[var(--ink-4)]/80">
          {t("graph.hover.hint")}
        </p>
      </div>
    </div>
  );
}
