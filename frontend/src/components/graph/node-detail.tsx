"use client";

import React from "react";
import Link from "next/link";
import { X, ExternalLink, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/locale-context";
import type { GraphNode } from "@/lib/types";

interface NodeDetailProps {
  node: GraphNode;
  connections?: Array<{
    relation: string;
    count: number;
  }>;
  relatedNodes?: Array<{
    id: string;
    label: string;
    type: string;
    relation: string;
  }>;
  wide?: boolean;
  onClose: () => void;
  onExpand: (nodeId: string, nodeType: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  paper: "#2c4870",
  mechanism: "#b88a3b",
  method: "#15803d",
  dataset: "#2c4870",
  puzzle: "#b54820",
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

const RELATION_LABEL_KEYS: Record<string, string> = {
  uses_dataset: "graph.relations.usesDataset",
  uses_method: "graph.relations.usesMethod",
  addresses_puzzle: "graph.relations.addressesPuzzle",
  engages_mechanism: "graph.relations.engagesMechanism",
  co_occurs: "graph.relations.coOccurs",
  cites: "graph.relations.cites",
  cited_by: "graph.relations.citedBy",
};

function formatRelationLabel(relation: string, t: (key: string) => string): string {
  const key = RELATION_LABEL_KEYS[relation];
  if (key) return t(key);
  return relation
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function NodeDetail({
  node,
  connections = [],
  relatedNodes = [],
  wide = false,
  onClose,
  onExpand,
}: NodeDetailProps) {
  const { t } = useI18n();
  const link = getNodeLink(node);
  const color = TYPE_COLORS[node.type] ?? "#807968";

  return (
    <Card className={`lp-card ${wide ? "w-full" : "w-80"} rounded-[var(--r-md)] bg-[var(--paper)] shadow-none backdrop-blur-md`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="section-kicker">{t("graph.detail.kicker")}</p>
            <Badge variant={getVariant(node.type)} className="mt-1 text-xs">
              {t(`graph.nodeTypes.${node.type}`)}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--ink-4)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
            aria-label={t("common.actions.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        {link ? (
          <Link
            href={link}
            className="font-display mt-3 block text-[1.55rem] leading-tight text-[var(--ink)] transition hover:text-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-2"
          >
            {node.label}
          </Link>
        ) : (
          <h3 className="font-display mt-3 text-[1.55rem] leading-tight text-[var(--ink)]">
            {node.label}
          </h3>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          {node.year != null ? (
            <span className="rounded-full bg-[var(--paper)]/75 px-2 py-0.5 text-xs text-[var(--ink-4)]">
              {node.year}
            </span>
          ) : null}
          {node.isSeed ? (
            <span className="rounded-full bg-[var(--forest-soft)] px-2 py-0.5 text-xs font-medium text-[var(--forest)]">
              {t("graph.detail.seed")}
            </span>
          ) : null}
          {node.fields?.slice(0, 3).map((field) => (
            <span
              key={field}
              className="rounded-full bg-[var(--paper-2)] px-2 py-0.5 text-xs text-[var(--ink)]"
            >
              {field}
            </span>
          ))}
        </div>

        {connections.length > 0 ? (
          <div className="mt-4 rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)]/50 p-3">
            <p className="section-kicker">{t("graph.detail.connectedBy")}</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {connections.map((item) => (
                <div key={item.relation} className="rounded-[0.75rem] bg-[var(--paper)] px-2 py-1.5">
                  <p className="truncate text-[11px] text-[var(--ink-4)]">
                    {formatRelationLabel(item.relation, t)}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {item.count}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {node.paperCount != null && node.type !== "paper" ? (
          <p className="mt-3 text-xs text-[var(--ink-4)]">
            {node.visiblePaperCount != null && node.visiblePaperCount !== node.paperCount
              ? t("graph.detail.visibleLinkedPapers", {
                  visible: node.visiblePaperCount,
                  total: node.paperCount,
                })
              : t("graph.detail.linkedPapers", { value: node.paperCount })}
          </p>
        ) : null}

        {relatedNodes.length > 0 ? (
          <div className="mt-4 rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)]/50 p-3">
            <p className="section-kicker">{t("graph.detail.neighbors")}</p>
            <div className="mt-2 space-y-2">
              {relatedNodes.slice(0, 6).map((item) => (
                <div key={`${item.relation}-${item.id}`} className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--ink)]">{item.label}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--ink-4)]">
                    {formatRelationLabel(item.relation, t)} · {t(`graph.nodeTypes.${item.type}`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          {link && (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
              <Link href={link}>
                <ExternalLink className="h-3 w-3" />
                {t("graph.detail.open")}
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
            {t("graph.detail.expand")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
