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
  strong: "bg-green-100 text-green-800 border-green-200",
  moderate: "bg-yellow-100 text-yellow-800 border-yellow-200",
  weak: "bg-red-100 text-red-800 border-red-200",
};

interface AtomHeaderProps {
  atom: AtomDetail;
}

export function AtomHeader({ atom }: AtomHeaderProps) {
  const evidenceClass =
    atom.evidenceStrength
      ? evidenceColors[atom.evidenceStrength.toLowerCase()] || "bg-gray-100 text-gray-800 border-gray-200"
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
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        {atom.title}
      </h1>
    </div>
  );
}
