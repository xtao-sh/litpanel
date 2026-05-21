"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import type { AtomDetail } from "@/lib/types";

const typeBadgeVariant: Record<string, "mechanism" | "method" | "dataset" | "puzzle"> = {
  mechanism: "mechanism",
  method: "method",
  dataset: "dataset",
  puzzle: "puzzle",
};

const evidenceColors: Record<string, string> = {
  strong: "bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]",
  moderate: "bg-[#f4ead8] text-[#654814] border-[#d6b678]",
  weak: "bg-[#f4dfd5] text-[#742b14] border-[#da9a80]",
};

interface AtomHeaderProps {
  atom: AtomDetail;
}

export function AtomHeader({ atom }: AtomHeaderProps) {
  const evidenceClass =
    atom.evidenceStrength
      ? evidenceColors[atom.evidenceStrength.toLowerCase()] || "bg-[var(--paper-2)] text-[var(--ink-2)] border-[var(--line-soft)]"
      : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={typeBadgeVariant[atom.type] || "secondary"} className="text-xs capitalize">
          {atom.type}
        </Badge>
        {atom.evidenceStrength && evidenceClass && (
          <Badge className={`text-xs border ${evidenceClass}`}>
            {atom.evidenceStrength} evidence
          </Badge>
        )}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
        {atom.title}
      </h1>
    </div>
  );
}
