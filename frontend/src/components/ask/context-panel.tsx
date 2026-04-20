"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, Wrench, Database, HelpCircle } from "lucide-react";

export interface ContextItem {
  entityType: string;
  entityId: string;
  title: string;
}

function entityIcon(type: string) {
  switch (type) {
    case "paper":
      return <FileText className="h-3.5 w-3.5 text-sky-600" />;
    case "method":
      return <Wrench className="h-3.5 w-3.5 text-emerald-600" />;
    case "dataset":
      return <Database className="h-3.5 w-3.5 text-violet-600" />;
    default:
      return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function entityHref(item: ContextItem): string {
  if (item.entityType === "paper") {
    return `/paper/${item.entityId}`;
  }
  return `/atom/${item.entityId}`;
}

interface ContextPanelProps {
  items: ContextItem[];
  defaultExpanded?: boolean;
}

export function ContextPanel({ items, defaultExpanded }: ContextPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  if (items.length === 0) return null;

  return (
    <div className="paper-panel mb-2 overflow-hidden rounded-[1.1rem] bg-background/88 transition-all duration-200">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label="Toggle retrieved context"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`} />
        <span>{items.length} items retrieved</span>
      </button>

      {expanded && (
        <div className="flex flex-wrap gap-1.5 overflow-x-auto border-t border-border/70 px-3 py-2.5">
          {items.map((item) => (
            <Link
              key={`${item.entityType}-${item.entityId}`}
              href={entityHref(item)}
              className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background/85 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-[color:oklch(var(--accent)/0.5)] hover:text-primary"
            >
              {entityIcon(item.entityType)}
              <span className="font-medium text-sm text-foreground truncate">{item.title || item.entityId}</span>
              <span className="text-xs font-mono text-muted-foreground">{item.entityId}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
