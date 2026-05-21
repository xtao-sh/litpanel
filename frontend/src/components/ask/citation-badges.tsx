"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface CitationBadgesProps {
  citations: string[];
}

export function CitationBadges({ citations }: CitationBadgesProps) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--line-soft)] pt-3">
      <span className="text-xs font-medium text-[var(--ink-4)]">Sources:</span>
      {citations.map((id) => (
        <Link key={id} href={`/paper/${id}`}>
          <Badge
            variant="paper"
            className="cursor-pointer transition-colors hover:bg-[#dfe7f2]"
          >
            {id}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
