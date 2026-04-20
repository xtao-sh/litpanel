"use client";

import React from "react";
import Link from "next/link";
import { X, ExternalLink, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { GraphNode } from "@/lib/types";

interface NodeDetailProps {
  node: GraphNode;
  connections?: Array<{
    relation: string;
    count: number;
  }>;
  onClose: () => void;
  onExpand: (nodeId: string, nodeType: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  paper: "#3b82f6",
  mechanism: "#f97316",
  method: "#22c55e",
  dataset: "#a855f7",
  puzzle: "#ef4444",
};

function getNodeLink(node: GraphNode): string | null {
  if (node.type === "paper") {
    return `/paper/${node.id}`;
  }
  // Atoms use the id which may carry an "atom:" prefix -- strip it for the URL
  if (["mechanism", "method", "dataset", "puzzle"].includes(node.type)) {
    const slug = node.id.startsWith("atom:") ? node.id.slice(5) : node.id;
    return `/atom/${slug}`;
  }
  return null;
}

function getVariant(
  type: string
): "paper" | "mechanism" | "method" | "dataset" | "puzzle" | "secondary" {
  if (
    type === "paper" ||
    type === "mechanism" ||
    type === "method" ||
    type === "dataset" ||
    type === "puzzle"
  ) {
    return type;
  }
  return "secondary";
}

function formatRelationLabel(relation: string): string {
  return relation
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function NodeDetail({ node, connections = [], onClose, onExpand }: NodeDetailProps) {
  const link = getNodeLink(node);
  const color = TYPE_COLORS[node.type] ?? "#6b7280";

  return (
    <Card className="paper-panel w-80 rounded-[1.55rem] bg-background/92 shadow-none backdrop-blur-md">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="section-kicker">Node dossier</p>
            <Badge variant={getVariant(node.type)} className="mt-1 text-xs">
              {node.type}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.45)] hover:text-foreground"
            aria-label="Close detail panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        <h3 className="font-display mt-3 text-[1.55rem] leading-tight text-foreground">
          {node.label}
        </h3>

        {/* Node info */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="capitalize">{node.type}</span>
            <span className="text-border">|</span>
            <span>ID: {node.id}</span>
          </div>

          {node.isSeed ? (
            <div className="text-xs font-medium text-primary">Seed node in current graph</div>
          ) : null}

          {node.size != null && (
            <div className="text-xs text-muted-foreground">
              Relative size: {node.size}
            </div>
          )}

          {node.year != null ? (
            <div className="text-xs text-muted-foreground">Year: {node.year}</div>
          ) : null}

          {node.theme ? (
            <div className="text-xs text-muted-foreground">Theme: {node.theme}</div>
          ) : null}

          {node.paperCount != null ? (
            <div className="text-xs text-muted-foreground">Linked papers: {node.paperCount}</div>
          ) : null}

          {node.fields && node.fields.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {node.fields.slice(0, 4).map((field) => (
                <span
                  key={field}
                  className="rounded-full bg-[color:oklch(var(--accent)/0.45)] px-2 py-0.5 text-[11px] text-foreground"
                >
                  {field}
                </span>
              ))}
            </div>
          ) : null}

          {connections.length > 0 ? (
            <div className="rounded-[1rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.38)] p-3">
              <p className="section-kicker">Connected by</p>
              <div className="mt-2 space-y-1.5">
                {connections.map((item) => (
                  <div key={item.relation} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatRelationLabel(item.relation)}</span>
                    <span className="rounded-full bg-background/85 px-1.5 py-0.5 font-medium text-foreground">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          {link && (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
              <Link href={link}>
                <ExternalLink className="h-3 w-3" />
                Open detail
              </Link>
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1.5 rounded-full text-xs"
            onClick={() => onExpand(node.id, node.type)}
          >
            <Expand className="h-3 w-3" />
            Expand
          </Button>
        </div>
      </div>
    </Card>
  );
}
