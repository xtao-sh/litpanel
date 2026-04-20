"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import { Search, RotateCcw, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useLazyQuery } from "@apollo/client/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { SEARCH } from "@/lib/queries";
import type { LayoutName } from "./cytoscape-graph";
import type { GraphNode, SearchResult, SearchHit } from "@/lib/types";

const NODE_TYPE_CONFIG = [
  { type: "paper", label: "Papers", color: "#3b82f6" },
  { type: "mechanism", label: "Mechanisms", color: "#f97316" },
  { type: "method", label: "Methods", color: "#22c55e" },
  { type: "dataset", label: "Datasets", color: "#a855f7" },
  { type: "puzzle", label: "Puzzles", color: "#ef4444" },
] as const;

const LAYOUT_OPTIONS: { value: LayoutName; label: string }[] = [
  { value: "cose", label: "Force-directed" },
  { value: "circle", label: "Circle" },
  { value: "grid", label: "Grid" },
  { value: "breadthfirst", label: "Breadthfirst" },
  { value: "concentric", label: "Concentric" },
];

interface GraphControlsProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  depth: number;
  onDepthChange: (depth: number) => void;
  disabledDepths?: Set<number>;
  depthHint?: string | null;
  visibleTypes: Set<string>;
  onToggleType: (type: string) => void;
  layout: LayoutName;
  onLayoutChange: (layout: LayoutName) => void;
  onReset: () => void;
  nodeCount: number;
  edgeCount: number;
  nodes: GraphNode[];
}

export function GraphControls({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  depth,
  onDepthChange,
  disabledDepths,
  depthHint,
  visibleTypes,
  onToggleType,
  layout,
  onLayoutChange,
  onReset,
  nodeCount,
  edgeCount,
  nodes,
}: GraphControlsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [topicSuggestions, setTopicSuggestions] = useState<SearchHit[]>([]);
  const [topicSuggestionsLoading, setTopicSuggestionsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fetchSuggestions] = useLazyQuery<{ search: SearchResult }>(SEARCH, {
    fetchPolicy: "network-only",
  });

  // In-graph node suggestions (local filter)
  const localSuggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return nodes
      .filter(
        (n) =>
          n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [searchQuery, nodes]);

  // Debounced topic search suggestions from backend
  const handleInputChange = useCallback(
    (value: string) => {
      onSearchChange(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = value.trim();
      // Only do backend search for inputs that look like topic keywords (3+ chars, not a paper ID or slug)
      if (trimmed.length < 3 || /^w\d+$/i.test(trimmed) || /^[a-z][a-z0-9_]*$/.test(trimmed)) {
        setTopicSuggestions([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setTopicSuggestionsLoading(true);
        try {
          const result = await fetchSuggestions({
            variables: { query: trimmed, limit: 5 },
          });
          setTopicSuggestions(result.data?.search?.hits ?? []);
        } catch {
          setTopicSuggestions([]);
        } finally {
          setTopicSuggestionsLoading(false);
        }
      }, 300);
    },
    [onSearchChange, fetchSuggestions]
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setShowSuggestions(false);
      onSearchSubmit(searchQuery);
    }
    if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (node: GraphNode) => {
    setShowSuggestions(false);
    onSearchChange(node.id);
    onSearchSubmit(node.id);
  };

  const handleTopicSuggestionClick = (hit: SearchHit) => {
    setShowSuggestions(false);
    setTopicSuggestions([]);
    onSearchChange(hit.entityId);
    onSearchSubmit(hit.entityId);
  };

  const selectedLayout = LAYOUT_OPTIONS.find((l) => l.value === layout);

  return (
    <Card className="paper-panel w-72 rounded-[1.55rem] bg-background/92 shadow-none backdrop-blur-md">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="section-kicker">Research map</p>
            <h3 className="font-display text-[1.45rem] text-foreground">Controls</h3>
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.45)] hover:text-foreground"
            aria-label={collapsed ? "Expand controls" : "Collapse controls"}
          >
            {collapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className={`overflow-hidden transition-all duration-200 ${collapsed ? "max-h-0 opacity-0" : "max-h-[600px] opacity-100"}`}>
          <div className="mt-3 space-y-4">
            {/* Search */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                {topicSuggestionsLoading && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    handleInputChange(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="ID, atom, or keywords..."
                  className="h-10 rounded-[1rem] pl-9 text-sm"
                />
                {showSuggestions && (localSuggestions.length > 0 || topicSuggestions.length > 0) && (
                  <div className="paper-panel absolute top-full z-50 mt-2 max-h-72 w-[320px] overflow-y-auto rounded-[1.1rem] py-1.5 shadow-none ring-1 ring-black/5">
                    {/* Local graph node suggestions */}
                    {localSuggestions.length > 0 && (
                      <>
                        <div className="border-b border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary bg-[color:oklch(var(--accent)/0.45)]">
                          In current graph
                        </div>
                        {localSuggestions.map((node) => (
                          <button
                            key={node.id}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-[color:oklch(var(--accent)/0.45)] transition-colors"
                            onMouseDown={() => handleSuggestionClick(node)}
                          >
                            <span
                              className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10"
                              style={{
                                backgroundColor:
                                  NODE_TYPE_CONFIG.find(
                                    (c) => c.type === node.type
                                  )?.color ?? "#999",
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                              {node.label}
                            </span>
                            <span className="ml-auto flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                              {node.type}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                    {/* Backend search suggestions for topic keywords */}
                    {topicSuggestions.length > 0 && (
                      <>
                        <div className="border-b border-border bg-[color:oklch(var(--accent)/0.45)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                          Search results
                        </div>
                        {topicSuggestions.map((hit) => (
                          <button
                            key={`${hit.entityType}-${hit.entityId}`}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-[color:oklch(var(--accent)/0.45)] transition-colors"
                            onMouseDown={() => handleTopicSuggestionClick(hit)}
                          >
                            <span
                              className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10"
                              style={{
                                backgroundColor:
                                  NODE_TYPE_CONFIG.find(
                                    (c) => c.type === hit.entityType
                                  )?.color ?? "#999",
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                              {hit.title}
                            </span>
                            <span className="ml-auto flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                              {hit.entityType}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Depth */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Depth
              </label>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((d) => (
                  <Button
                    key={d}
                    variant={depth === d ? "default" : "outline"}
                    size="sm"
                    className="h-9 w-9 rounded-full p-0 text-xs"
                    onClick={() => onDepthChange(d)}
                    disabled={disabledDepths?.has(d)}
                  >
                    {d}
                  </Button>
                ))}
              </div>
              {depthHint ? (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {depthHint}
                </p>
              ) : null}
            </div>

            {/* Node types */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Node Types
              </label>
              <div className="space-y-1.5">
                {NODE_TYPE_CONFIG.map(({ type, label, color }) => (
                  <label
                    key={type}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Checkbox
                      checked={visibleTypes.has(type)}
                      onCheckedChange={() => onToggleType(type)}
                      className="h-3.5 w-3.5"
                      aria-label={`Toggle ${label.toLowerCase()} nodes`}
                      style={
                        {
                          borderColor: color,
                          "--checkbox-bg": color,
                        } as React.CSSProperties
                      }
                    />
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Layout */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Layout
              </label>
              <div className="relative">
                <button
                  onClick={() => setLayoutOpen(!layoutOpen)}
                  className="flex h-10 w-full items-center justify-between rounded-[1rem] border border-border bg-background/80 px-3 text-sm text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.45)]"
                >
                  <span>{selectedLayout?.label ?? "Force-directed"}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                {layoutOpen && (
                  <div className="paper-panel absolute top-full z-50 mt-2 w-full rounded-[1rem] py-1 shadow-none">
                    {LAYOUT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[color:oklch(var(--accent)/0.45)] ${
                          layout === opt.value
                            ? "bg-[color:oklch(var(--accent)/0.55)] font-medium text-primary"
                            : "text-muted-foreground"
                        }`}
                        onClick={() => {
                          onLayoutChange(opt.value);
                          setLayoutOpen(false);
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Stats & reset */}
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                {nodeCount} nodes / {edgeCount} edges
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 rounded-full px-3 text-xs text-muted-foreground"
                onClick={onReset}
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
