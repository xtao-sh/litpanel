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
      return <FileText className="h-3.5 w-3.5 text-blue-500" />;
    case "method":
      return <Wrench className="h-3.5 w-3.5 text-green-500" />;
    case "dataset":
      return <Database className="h-3.5 w-3.5 text-purple-500" />;
    default:
      return <HelpCircle className="h-3.5 w-3.5 text-gray-400" />;
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
    <div className="mb-2 overflow-hidden rounded-lg bg-muted/50 transition-all duration-200">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`} />
        <span>{items.length} items retrieved</span>
      </button>

      {expanded && (
        <div className="flex flex-wrap gap-1.5 border-t border-gray-200/60 px-3 py-2.5 overflow-x-auto">
          {items.map((item) => (
            <Link
              key={`${item.entityType}-${item.entityId}`}
              href={entityHref(item)}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
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
