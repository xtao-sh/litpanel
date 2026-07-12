"use client";

import React, { Suspense, useState, useCallback, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useLazyQuery } from "@apollo/client/react";
import {
  ArrowLeft,
  ChevronDown,
  GitBranch,
  Loader2,
  Network,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  GET_PAPER_NETWORK,
  GET_ATOM_NEIGHBORHOOD,
  GET_PAPER_SET_NETWORK,
  RESEARCH_PAPERS,
  SEARCH,
} from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { NodeDetail } from "@/components/graph/node-detail";
import type { LayoutName } from "@/components/graph/cytoscape-graph";
import { useI18n } from "@/lib/i18n/locale-context";
import type {
  GraphEdge,
  GraphNode,
  NetworkGraph,
  ResearchFilter,
  SearchResult,
  SearchHit,
} from "@/lib/types";

const CytoscapeGraph = dynamic(
  () =>
    import("@/components/graph/cytoscape-graph").then(
      (mod) => mod.CytoscapeGraph
    ),
  { ssr: false }
);

const ALL_TYPES = new Set(["paper", "mechanism", "method", "dataset", "puzzle"]);
const DIRECT_PAPER_ID_PATTERN = /^(?:w\d+|demo-[a-z0-9_-]+|upload_[a-z0-9_-]+|doi_[a-z0-9_-]+|arxiv_[a-z0-9_-]+)$/i;
// A plain word such as "insurance" is usually a topic query, not an atom ID.
// Treat only slug-shaped values as direct atoms; suggestion clicks still pass
// entityType="atom" and support one-word atom slugs explicitly.
const DIRECT_ATOM_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/i;

function toSlug(nodeId: string): string {
  return nodeId.startsWith("atom:") ? nodeId.slice(5) : nodeId;
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function buildResearchFilterInput(filters: ResearchFilter): Record<string, unknown> | null {
  const filterInput: Record<string, unknown> = {};
  if (filters.fields && filters.fields.length > 0) filterInput.fields = filters.fields;
  if (filters.yearMin != null) filterInput.yearMin = filters.yearMin;
  if (filters.yearMax != null) filterInput.yearMax = filters.yearMax;
  if (filters.scoreMin != null) filterInput.scoreMin = filters.scoreMin;
  if (filters.scoreMax != null) filterInput.scoreMax = filters.scoreMax;
  if (filters.hasCard != null) filterInput.hasCard = filters.hasCard;
  if (filters.atomSlugs && filters.atomSlugs.length > 0) {
    filterInput.atomSlugs = filters.atomSlugs;
  }
  return Object.keys(filterInput).length > 0 ? filterInput : null;
}

function getSourceLabel(t: (key: string) => string, source?: string | null): string {
  switch (source) {
    case "research":
      return t("graph.back.research");
    case "paper":
      return t("graph.back.paper");
    case "ask":
      return t("graph.back.ask");
    case "project":
      return t("graph.back.project");
    case "latest":
      return t("graph.back.latest");
    default:
      return t("graph.back.default");
  }
}

interface ResearchPapersGraphResult {
  researchPapers: {
    allPaperIds: string[];
  };
}

interface PaperSetScope {
  query: string;
  label: string;
  filters: ResearchFilter;
  source?: string;
  returnTo?: string;
  paperIds: string[];
}

interface GraphContextState {
  label: string;
  source?: string;
  returnTo?: string;
  mode: "entity" | "paper-set";
}

interface NodeConnectionSummary {
  relation: string;
  count: number;
}

interface GraphOverviewItem {
  id: string;
  label: string;
  meta: string;
}

interface GraphOverviewGroup {
  id: string;
  label: string;
  count: number;
  nodeIds: string[];
  edgeIds: string[];
  items: GraphOverviewItem[];
}

const GRAPH_NODE_LEGEND = [
  { type: "paper", labelKey: "graph.nodeTypes.paper", color: "#2c4870" },
  { type: "method", labelKey: "graph.nodeTypes.method", color: "#15803d" },
  { type: "dataset", labelKey: "graph.nodeTypes.dataset", color: "#2c4870" },
  { type: "mechanism", labelKey: "graph.nodeTypes.mechanism", color: "#b88a3b" },
  { type: "puzzle", labelKey: "graph.nodeTypes.puzzle", color: "#b54820" },
] as const;

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

function graphEdgeId(edge: GraphEdge): string {
  return `${edge.source}-${edge.target}-${edge.relation}`;
}

const LAYOUT_OPTIONS: { value: LayoutName; labelKey: string }[] = [
  { value: "map", labelKey: "graph.layouts.map" },
  { value: "cose", labelKey: "graph.layouts.force" },
  { value: "concentric", labelKey: "graph.layouts.concentric" },
  { value: "breadthfirst", labelKey: "graph.layouts.layers" },
  { value: "circle", labelKey: "graph.layouts.circle" },
  { value: "grid", labelKey: "graph.layouts.grid" },
];

function GraphToolbar({
  title,
  returnTo,
  source,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  depth,
  onDepthChange,
  disabledDepths,
  depthHint,
  visibleTypes,
  onToggleType,
  showPeripheralPapers,
  peripheralPaperCount,
  onTogglePeripheralPapers,
  layout,
  onLayoutChange,
  onReset,
  nodeCount,
  edgeCount,
}: {
  title?: string;
  returnTo?: string;
  source?: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  depth: number;
  onDepthChange: (depth: number) => void;
  disabledDepths: Set<number>;
  depthHint: string | null;
  visibleTypes: Set<string>;
  onToggleType: (type: string) => void;
  showPeripheralPapers: boolean;
  peripheralPaperCount: number;
  onTogglePeripheralPapers: () => void;
  layout: LayoutName;
  onLayoutChange: (layout: LayoutName) => void;
  onReset: () => void;
  nodeCount: number;
  edgeCount: number;
}) {
  const { t } = useI18n();
  const [layoutOpen, setLayoutOpen] = useState(false);
  const activeLayout = LAYOUT_OPTIONS.find((item) => item.value === layout);

  return (
    <div className="absolute left-4 right-4 top-4 z-20 rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-3 backdrop-blur-md">
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
        <div className="flex min-w-0 items-center gap-2">
          {returnTo ? (
            <Button asChild variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-full" title={getSourceLabel(t, source)}>
              <Link href={returnTo}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <div className="min-w-0">
            <p className="section-kicker">{t("graph.toolbar.kicker")}</p>
            {title ? (
              <h1 className="truncate text-base font-semibold text-[var(--ink)]">{title}</h1>
            ) : null}
          </div>
        </div>

        <form
          className="flex min-w-[260px] flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSearchSubmit(searchQuery);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-4)]" />
            <input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("graph.toolbar.searchPlaceholder")}
              className="h-9 w-full rounded-full border border-[var(--line-soft)] bg-[var(--paper)] pl-9 pr-3 text-sm outline-none transition focus:border-[var(--forest)]"
            />
          </div>
          <Button type="submit" size="sm" className="h-9 rounded-full px-4 text-xs">
            {t("common.actions.search")}
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] p-1" title={depthHint ?? t("graph.toolbar.depthTitle")}>
            {[1, 2, 3].map((item) => (
              <button
                key={item}
                type="button"
                disabled={disabledDepths.has(item)}
                onClick={() => onDepthChange(item)}
                className={`h-7 min-w-7 rounded-full px-2 text-xs font-medium transition disabled:opacity-35 ${
                  depth === item
                    ? "bg-[var(--ink)] text-[var(--paper)]"
                    : "text-[var(--ink-4)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          {depthHint ? (
            <p className="max-w-[18rem] text-[11px] leading-snug text-[var(--ink-4)]">
              {depthHint}
            </p>
          ) : null}

          <div className="relative">
            <button
              type="button"
              onClick={() => setLayoutOpen((open) => !open)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-xs font-medium text-[var(--ink-4)] hover:text-[var(--ink)]"
            >
              {t(activeLayout?.labelKey ?? "graph.layouts.force")}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {layoutOpen && (
              <div className="lp-card absolute right-0 top-full z-30 mt-2 w-44 rounded-[var(--r-md)] p-1">
                {LAYOUT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onLayoutChange(option.value);
                      setLayoutOpen(false);
                    }}
                    className={`flex w-full rounded-[0.8rem] px-3 py-1.5 text-left text-xs ${
                      layout === option.value
                        ? "bg-[var(--paper-3)] text-[var(--ink)]"
                        : "text-[var(--ink-4)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={onReset} title={t("common.actions.reset")}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {GRAPH_NODE_LEGEND.map((item) => {
            const isVisible = visibleTypes.has(item.type);
            return (
              <button
                key={item.type}
                type="button"
                onClick={() => onToggleType(item.type)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                  isVisible
                    ? "border-[var(--line-soft)] bg-[var(--paper)] text-[var(--ink)]"
                    : "border-transparent bg-[var(--paper-2)] text-[var(--ink-4)]"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                {t(item.labelKey)}
              </button>
            );
          })}
          {peripheralPaperCount > 0 ? (
            <button
              type="button"
              onClick={onTogglePeripheralPapers}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                showPeripheralPapers
                  ? "border-[var(--line-soft)] bg-[var(--paper)] text-[var(--ink)]"
                  : "border-transparent bg-[var(--paper-2)] text-[var(--ink-4)]"
              }`}
              title={t("graph.toolbar.peripheralHint")}
            >
              {t("graph.toolbar.peripheralPapers", {
                count: peripheralPaperCount.toLocaleString(),
              })}
            </button>
          ) : null}
        </div>
        <p className="text-xs text-[var(--ink-4)]">
          {t("graph.toolbar.counts", { nodes: nodeCount.toLocaleString(), edges: edgeCount.toLocaleString() })}
        </p>
      </div>
    </div>
  );
}

function GraphContextPanel({
  summary,
  groups = [],
  activeGroupId,
  onGroupClick,
  onGroupHover,
  onGroupLeave,
}: {
  summary: string | null;
  groups: GraphOverviewGroup[];
  activeGroupId: string | null;
  onGroupClick: (groupId: string) => void;
  onGroupHover: (groupId: string) => void;
  onGroupLeave: () => void;
}) {
  const { t } = useI18n();
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;

  return (
    <div className="lp-card w-80 rounded-[var(--r-md)] bg-[var(--paper)] p-4 backdrop-blur-md">
      <p className="section-kicker">{t("graph.context.kicker")}</p>
      <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">{t("graph.context.title")}</h2>
      {summary ? (
        <p className="mt-3 text-xs leading-relaxed text-[var(--ink-4)]" title={summary}>
          {summary.length > 240 ? `${summary.slice(0, 237)}...` : summary}
        </p>
      ) : null}
      <div className="mt-4 space-y-1.5">
        {groups.map((group) => {
          const isActive = group.id === activeGroupId;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onGroupClick(group.id)}
              onMouseEnter={() => onGroupHover(group.id)}
              onMouseLeave={onGroupLeave}
              className={`flex w-full items-center justify-between rounded-[0.75rem] border px-3 py-2 text-left text-xs transition ${
                isActive
                  ? "border-[var(--forest)] bg-[var(--forest-soft)] text-[var(--ink)]"
                  : "border-[var(--line-soft)] bg-[var(--paper)] text-[var(--ink-4)] hover:border-[var(--forest)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
              }`}
            >
              <span className="truncate">{group.label}</span>
              <span className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[var(--ink)]">
                {group.count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 border-t border-[var(--line-soft)] pt-3">
        {activeGroup ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium text-[var(--ink)]">{activeGroup.label}</p>
              <span className="text-[11px] text-[var(--ink-4)]">
                {t("graph.context.itemCount", { count: activeGroup.items.length.toLocaleString() })}
              </span>
            </div>
            {activeGroup.items.length > 0 ? (
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
                {activeGroup.items.slice(0, 80).map((item) => (
                  <div key={item.id} className="rounded-[0.65rem] border border-[var(--line-soft)] bg-[var(--paper)] px-2.5 py-2">
                    <p className="line-clamp-2 text-xs font-medium leading-snug text-[var(--ink)]">{item.label}</p>
                    <p className="mt-1 truncate text-[11px] text-[var(--ink-4)]">{item.meta}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--ink-4)]">{t("graph.context.emptyGroup")}</p>
            )}
          </>
        ) : (
          <p className="text-xs text-[var(--ink-4)]">{t("graph.context.clickGroupHint")}</p>
        )}
      </div>
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense>
      <GraphPageInner />
    </Suspense>
  );
}

function GraphPageInner() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const initialQuery = (searchParams.get("q") ?? "").trim();
  const initialMode = (searchParams.get("mode") ?? "").trim();
  const initialPaperId = (searchParams.get("paperId") ?? "").trim();
  const initialContextQuery = (searchParams.get("contextQuery") ?? "").trim();
  const initialPaperIds = useMemo(
    () => parseStringArray(searchParams.get("ids")),
    [searchParams]
  );
  const initialLabel = (searchParams.get("label") ?? "").trim();
  const initialReturnTo = (searchParams.get("returnTo") ?? "").trim() || undefined;
  const initialSource = (searchParams.get("source") ?? "").trim() || undefined;
  const initialFilters = useMemo<ResearchFilter>(
    () => ({
      fields: parseStringArray(searchParams.get("field")),
      yearMin: parseNumber(searchParams.get("yearMin")),
      yearMax: parseNumber(searchParams.get("yearMax")),
      scoreMin: parseNumber(searchParams.get("scoreMin")),
      scoreMax: parseNumber(searchParams.get("scoreMax")),
      hasCard: searchParams.get("hasCard") === "1" ? true : undefined,
      atomSlugs: parseStringArray(searchParams.get("atomSlug")),
    }),
    [searchParams]
  );

  const [searchQuery, setSearchQuery] = useState(
    initialMode === "paper" && initialPaperId
      ? initialLabel || initialPaperId
      : initialMode === "paper-set" && initialContextQuery
      ? initialContextQuery
      : initialMode === "paper-ids" && initialLabel
        ? initialLabel
        : initialQuery
  );
  const [depth, setDepth] = useState(1);
  const [layout, setLayout] = useState<LayoutName>("cose");
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    new Set(ALL_TYPES)
  );
  const [showPeripheralPapers, setShowPeripheralPapers] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [activeOverviewGroupId, setActiveOverviewGroupId] = useState<string | null>(null);
  const [hoveredOverviewGroupId, setHoveredOverviewGroupId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<NetworkGraph | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [topicSearchLoading, setTopicSearchLoading] = useState(false);
  const [graphContext, setGraphContext] = useState<GraphContextState | null>(null);
  const [paperSetScope, setPaperSetScope] = useState<PaperSetScope | null>(null);

  const [fetchPaperNetwork, { loading: paperLoading }] =
    useLazyQuery<{ paperNetwork: NetworkGraph }>(GET_PAPER_NETWORK, {
      fetchPolicy: "network-only",
    });

  const [fetchAtomNeighborhood, { loading: atomLoading }] =
    useLazyQuery<{ atomNeighborhood: NetworkGraph }>(GET_ATOM_NEIGHBORHOOD, {
      fetchPolicy: "network-only",
    });

  const [fetchPaperSetNetwork, { loading: paperSetLoading }] =
    useLazyQuery<{ paperSetNetwork: NetworkGraph }>(GET_PAPER_SET_NETWORK, {
      fetchPolicy: "network-only",
    });

  const [fetchResearchPapers, { loading: researchScopeLoading }] =
    useLazyQuery<ResearchPapersGraphResult>(RESEARCH_PAPERS, {
      fetchPolicy: "network-only",
    });

  const loading =
    paperLoading ||
    atomLoading ||
    paperSetLoading ||
    researchScopeLoading ||
    topicSearchLoading;

  const loadPaperNetwork = useCallback(
    async (paperId: string, currentDepth: number, nextContext?: Partial<GraphContextState>) => {
      try {
        const result = await fetchPaperNetwork({
          variables: { paperId, depth: currentDepth },
        });
        const net = result.data?.paperNetwork;
        const runtimeError = net?.errorMessage || result.error?.message;

        if (runtimeError) {
          setErrorMsg(runtimeError);
          setSearchMessage(net?.warningMessage ?? null);
          setGraphData(null);
        } else if (!net || net.nodes.length === 0) {
          setErrorMsg(t("graph.errors.noPaper"));
          setSearchMessage(net?.warningMessage ?? null);
          setGraphData(null);
        } else {
          const paperNodeCount = net.nodes.filter((node) => node.type === "paper").length;
          setErrorMsg(null);
          setSearchMessage(
            net.warningMessage
              ? net.warningMessage
              : paperNodeCount <= 1
              ? t("graph.messages.paperIsolated", { label: nextContext?.label ?? paperId })
              : net.nodes.length <= 1 || net.edges.length === 0
                ? t("graph.messages.noLinks", { label: nextContext?.label ?? paperId })
                : null
          );
          setGraphData(net);
          setGraphContext({
            label: nextContext?.label ?? paperId,
            source: nextContext?.source ?? graphContext?.source ?? initialSource,
            returnTo: nextContext?.returnTo ?? graphContext?.returnTo ?? initialReturnTo,
            mode: "entity",
          });
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : t("graph.errors.loadPaper"));
        setGraphData(null);
      }
      setHasSearched(true);
    },
    [fetchPaperNetwork, graphContext, initialReturnTo, initialSource, t]
  );

  const loadAtomNeighborhood = useCallback(
    async (slug: string, currentDepth: number, nextContext?: Partial<GraphContextState>) => {
      try {
        const result = await fetchAtomNeighborhood({
          variables: { slug, depth: currentDepth },
        });
        const net = result.data?.atomNeighborhood;
        const runtimeError = net?.errorMessage || result.error?.message;

        if (runtimeError) {
          setErrorMsg(runtimeError);
          setSearchMessage(net?.warningMessage ?? null);
          setGraphData(null);
        } else if (!net || net.nodes.length === 0) {
          setErrorMsg(t("graph.errors.noAtom"));
          setSearchMessage(net?.warningMessage ?? null);
          setGraphData(null);
        } else {
          setErrorMsg(null);
          setSearchMessage(
            net.warningMessage
              ? net.warningMessage
              : net.nodes.length <= 1 || net.edges.length === 0
              ? t("graph.messages.smallNeighborhood", { label: nextContext?.label ?? slug })
              : null
          );
          setGraphData(net);
          setGraphContext({
            label: nextContext?.label ?? slug,
            source: nextContext?.source ?? graphContext?.source ?? initialSource,
            returnTo: nextContext?.returnTo ?? graphContext?.returnTo ?? initialReturnTo,
            mode: "entity",
          });
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : t("graph.errors.loadAtom"));
        setGraphData(null);
      }
      setHasSearched(true);
    },
    [fetchAtomNeighborhood, graphContext, initialReturnTo, initialSource, t]
  );

  const loadPaperSetNetwork = useCallback(
    async (scope: PaperSetScope, currentDepth: number) => {
      try {
        const result = await fetchPaperSetNetwork({
          variables: { paperIds: scope.paperIds, depth: currentDepth },
        });
        const net = result.data?.paperSetNetwork;
        const runtimeError = net?.errorMessage || result.error?.message;

        if (runtimeError) {
          setErrorMsg(runtimeError);
          setSearchMessage(net?.warningMessage ?? null);
          setGraphData(null);
        } else if (!net || net.nodes.length === 0) {
          setErrorMsg(t("graph.errors.noSetGraph"));
          setSearchMessage(net?.warningMessage ?? null);
          setGraphData(null);
        } else {
          setErrorMsg(null);
          setSearchMessage(net.warningMessage ?? null);
          setGraphData(net);
          setGraphContext({
            label: scope.label,
            source: scope.source,
            returnTo: scope.returnTo,
            mode: "paper-set",
          });
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : t("graph.errors.loadSet"));
        setGraphData(null);
      }
      setHasSearched(true);
    },
    [fetchPaperSetNetwork, t]
  );

  const loadResearchContextGraph = useCallback(
    async (
      query: string,
      filters: ResearchFilter,
      currentDepth: number,
      options?: { label?: string; source?: string; returnTo?: string }
    ) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;

      setSelectedNode(null);
      setSearchMessage(null);
      setErrorMsg(null);
      setTopicSearchLoading(true);

      try {
        const result = await fetchResearchPapers({
          variables: {
            query: trimmedQuery,
            filters: buildResearchFilterInput(filters),
            sort: null,
            limit: 1,
            offset: 0,
          },
        });
        if (result.error) {
          throw new Error(result.error.message);
        }
        const paperIds = result.data?.researchPapers?.allPaperIds ?? [];

        if (paperIds.length === 0) {
          setErrorMsg(t("graph.errors.noMatches", { query: trimmedQuery }));
          setGraphData(null);
          setHasSearched(true);
          setPaperSetScope(null);
          return;
        }

        const scope: PaperSetScope = {
          query: trimmedQuery,
          label: options?.label?.trim() || trimmedQuery,
          filters,
          source: options?.source ?? graphContext?.source ?? initialSource,
          returnTo: options?.returnTo ?? graphContext?.returnTo ?? initialReturnTo,
          paperIds,
        };
        setPaperSetScope(scope);
        setSearchQuery(trimmedQuery);
        await loadPaperSetNetwork(scope, currentDepth);
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : t("graph.errors.buildScope")
        );
        setGraphData(null);
        setHasSearched(true);
      } finally {
        setTopicSearchLoading(false);
      }
    },
    [
      fetchResearchPapers,
      graphContext,
      initialReturnTo,
      initialSource,
      loadPaperSetNetwork,
      t,
    ]
  );

  const handleSearchSubmit = useCallback(
    async (value: string, entityType?: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      setSelectedNode(null);
      setErrorMsg(null);
      setSearchMessage(null);
      setPaperSetScope(null);

      const inheritedContext = {
        source: graphContext?.source ?? initialSource,
        returnTo: graphContext?.returnTo ?? initialReturnTo,
      };

      if (entityType === "paper" || DIRECT_PAPER_ID_PATTERN.test(trimmed)) {
        await loadPaperNetwork(trimmed.toLowerCase(), depth, {
          label: trimmed.toLowerCase(),
          ...inheritedContext,
        });
        return;
      }

      if (entityType === "atom" || (entityType == null && DIRECT_ATOM_ID_PATTERN.test(trimmed))) {
        await loadAtomNeighborhood(trimmed, depth, {
          label: trimmed,
          ...inheritedContext,
        });
        return;
      }

      setSearchMessage(
        t("graph.messages.topicGraph", { query: trimmed })
      );
      await loadResearchContextGraph(trimmed, {}, depth, {
        label: trimmed,
        ...inheritedContext,
      });
    },
    [
      depth,
      graphContext,
      initialReturnTo,
      initialSource,
      loadAtomNeighborhood,
      loadPaperNetwork,
      loadResearchContextGraph,
      t,
    ]
  );

  const initialSearchDone = useRef(false);
  useEffect(() => {
    if (initialSearchDone.current) return;

    if (initialMode === "paper" && initialPaperId) {
      initialSearchDone.current = true;
      void loadPaperNetwork(initialPaperId.toLowerCase(), depth, {
        label: initialLabel || initialPaperId,
        source: initialSource,
        returnTo: initialReturnTo,
      });
      return;
    }

    if (initialMode === "paper-set" && initialContextQuery) {
      initialSearchDone.current = true;
      void loadResearchContextGraph(initialContextQuery, initialFilters, depth, {
        label: initialLabel || initialContextQuery,
        source: initialSource,
        returnTo: initialReturnTo,
      });
      return;
    }

    if (initialMode === "paper-ids" && initialPaperIds.length > 0) {
      initialSearchDone.current = true;
      const scope: PaperSetScope = {
        query: initialLabel || initialPaperIds[0],
        label: initialLabel || "Selected papers",
        filters: {},
        source: initialSource,
        returnTo: initialReturnTo,
        paperIds: initialPaperIds,
      };
      setPaperSetScope(scope);
      setSearchQuery(scope.label);
      void loadPaperSetNetwork(scope, depth);
      return;
    }

    if (initialQuery) {
      initialSearchDone.current = true;
      void handleSearchSubmit(initialQuery);
    }
  }, [
    depth,
    handleSearchSubmit,
    initialContextQuery,
    initialFilters,
    initialLabel,
    initialMode,
    initialPaperId,
    initialPaperIds,
    initialQuery,
    initialReturnTo,
    initialSource,
    loadPaperNetwork,
    loadResearchContextGraph,
    loadPaperSetNetwork,
  ]);

  const handleDepthChange = useCallback(
    (newDepth: number) => {
      setDepth(newDepth);

      if (paperSetScope) {
        void loadPaperSetNetwork(paperSetScope, newDepth);
        return;
      }

      if (graphData && graphData.nodes.length > 0) {
        const centerId = selectedNode?.id ?? graphData.nodes.find((node) => node.isSeed)?.id ?? graphData.nodes[0]?.id;
        if (centerId) {
          const centerNode = graphData.nodes.find((n) => n.id === centerId);
          if (centerNode?.type === "paper") {
            void loadPaperNetwork(centerId, newDepth, {
              label: centerNode.label,
            });
          } else {
            void loadAtomNeighborhood(toSlug(centerId), newDepth, {
              label: centerNode?.label ?? toSlug(centerId),
            });
          }
        }
      }
    },
    [graphData, loadAtomNeighborhood, loadPaperNetwork, loadPaperSetNetwork, paperSetScope, selectedNode]
  );

  const handleToggleType = useCallback((type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) {
          next.delete(type);
        }
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const handleNodeExpand = useCallback(
    (nodeId: string, nodeType: string) => {
      const nextNode = graphData?.nodes.find((node) => node.id === nodeId);
      setSearchQuery(nodeId);
      setErrorMsg(null);
      setPaperSetScope(null);

      const inheritedContext = {
        source: graphContext?.source ?? initialSource,
        returnTo: graphContext?.returnTo ?? initialReturnTo,
      };

      if (nodeType === "paper") {
        void loadPaperNetwork(nodeId, depth, {
          label: nextNode?.label ?? nodeId,
          ...inheritedContext,
        });
      } else {
        void loadAtomNeighborhood(toSlug(nodeId), depth, {
          label: nextNode?.label ?? toSlug(nodeId),
          ...inheritedContext,
        });
      }
    },
    [
      depth,
      graphContext,
      graphData,
      initialReturnTo,
      initialSource,
      loadAtomNeighborhood,
      loadPaperNetwork,
    ]
  );

  const handleReset = useCallback(() => {
    setGraphData(null);
    setSelectedNode(null);
    setSearchQuery("");
    setDepth(1);
    setLayout("cose");
    setVisibleTypes(new Set(ALL_TYPES));
    setShowPeripheralPapers(false);
    setOverviewOpen(false);
    setActiveOverviewGroupId(null);
    setHoveredOverviewGroupId(null);
    setHasSearched(false);
    setErrorMsg(null);
    setSearchMessage(null);
    setGraphContext(null);
    setPaperSetScope(null);
  }, []);

  const filteredNodes = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes.filter((n) => visibleTypes.has(n.type));
  }, [graphData, visibleTypes]);

  const filteredEdges = useMemo(() => {
    if (!graphData) return [];
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return graphData.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );
  }, [graphData, filteredNodes]);

  const selectedNodeConnections = useMemo<NodeConnectionSummary[]>(() => {
    if (!selectedNode || !graphData) return [];
    const relationCounts = new Map<string, number>();
    graphData.edges.forEach((edge) => {
      if (edge.source !== selectedNode.id && edge.target !== selectedNode.id) return;
      relationCounts.set(edge.relation, (relationCounts.get(edge.relation) ?? 0) + 1);
    });
    return Array.from(relationCounts.entries())
      .map(([relation, count]) => ({ relation, count }))
      .sort((a, b) => b.count - a.count);
  }, [graphData, selectedNode]);

  const selectedRelatedNodes = useMemo(() => {
    if (!selectedNode || !graphData) return [];
    const nodesById = new Map(graphData.nodes.map((node) => [node.id, node]));
    return graphData.edges
      .filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
      .map((edge) => {
        const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
        const other = nodesById.get(otherId);
        if (!other) return null;
        return {
          id: other.id,
          label: other.label,
          type: other.type,
          relation: edge.relation,
        };
      })
      .filter((item): item is { id: string; label: string; type: string; relation: string } => Boolean(item))
      .slice(0, 12);
  }, [graphData, selectedNode]);

  const visibleRelationSummaries = useMemo<NodeConnectionSummary[]>(() => {
    if (!graphData) return [];
    const relationCounts = new Map<string, number>();
    filteredEdges.forEach((edge) => {
      relationCounts.set(edge.relation, (relationCounts.get(edge.relation) ?? 0) + 1);
    });
    return Array.from(relationCounts.entries())
      .map(([relation, count]) => ({ relation, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredEdges, graphData]);

  const paperSetDiagnostics = useMemo(() => {
    if (!graphData || graphData.mode !== "paper_set") return null;

    const paperNodes = graphData.nodes.filter((node) => node.type === "paper");
    const seedPaperNodes = paperNodes.filter((node) => node.isSeed);
    const seedIds = new Set(seedPaperNodes.map((node) => node.id));
    const connectedSeedIds = new Set<string>();

    graphData.edges.forEach((edge) => {
      if (seedIds.has(edge.source)) connectedSeedIds.add(edge.source);
      if (seedIds.has(edge.target)) connectedSeedIds.add(edge.target);
    });

    return {
      paperNodeCount: paperNodes.length,
      seedPaperCount: seedPaperNodes.length,
      contextualPaperCount: Math.max(0, paperNodes.length - seedPaperNodes.length),
      isolatedSeedCount: Math.max(0, seedPaperNodes.length - connectedSeedIds.size),
    };
  }, [graphData]);

  const graphSummary = useMemo(() => {
    if (!graphData) return null;

    if (graphData.mode === "paper_set") {
      const label = graphContext?.label || paperSetScope?.label || t("graph.title");
      const sourcePaperCount = graphData.sourcePaperCount ?? paperSetScope?.paperIds.length ?? 0;
      const pieces = [
        t("graph.summary.paperSet", {
          label,
          matched: sourcePaperCount.toLocaleString(),
          seed: graphData.seedCount.toLocaleString(),
          papers: graphData.totalPaperNodes.toLocaleString(),
          depth,
        }),
      ];
      if (graphData.truncated) {
        pieces.push(t("graph.summary.truncated", { count: graphData.seedCount.toLocaleString() }));
      }
      const isolationNote =
        paperSetDiagnostics && paperSetDiagnostics.isolatedSeedCount > 0
          ? t("graph.summary.isolated", { count: paperSetDiagnostics.isolatedSeedCount.toLocaleString() })
          : null;
      if (isolationNote) pieces.push(isolationNote);
      return pieces.join(" · ");
    }

    return searchMessage;
  }, [depth, graphContext, graphData, paperSetDiagnostics, paperSetScope, searchMessage, t]);

  const graphTitle = graphContext?.label || paperSetScope?.label || searchQuery || t("graph.title");
  const visiblePaperShape = useMemo(() => {
    const connectedIds = new Set<string>();
    filteredEdges.forEach((edge) => {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    });
    let corePaperCount = 0;
    let isolatedPaperCount = 0;
    filteredNodes.forEach((node) => {
      if (node.type !== "paper") return;
      if (connectedIds.has(node.id)) {
        corePaperCount += 1;
      } else {
        isolatedPaperCount += 1;
      }
    });
    return { corePaperCount, isolatedPaperCount };
  }, [filteredEdges, filteredNodes]);

  const displayedNodes = useMemo(() => {
    if (showPeripheralPapers) return filteredNodes;
    const connectedIds = new Set<string>();
    filteredEdges.forEach((edge) => {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    });
    return filteredNodes.filter((node) => node.type !== "paper" || connectedIds.has(node.id));
  }, [filteredEdges, filteredNodes, showPeripheralPapers]);

  const displayedNodeIds = useMemo(
    () => new Set(displayedNodes.map((node) => node.id)),
    [displayedNodes]
  );

  const displayedEdges = useMemo(
    () =>
      filteredEdges.filter(
        (edge) => displayedNodeIds.has(edge.source) && displayedNodeIds.has(edge.target)
      ),
    [displayedNodeIds, filteredEdges]
  );

  const overviewGroups = useMemo<GraphOverviewGroup[]>(() => {
    if (!graphData) return [];

    const nodesById = new Map(filteredNodes.map((node) => [node.id, node]));
    const connectedIds = new Set<string>();
    filteredEdges.forEach((edge) => {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    });

    const formatNodeMeta = (node: GraphNode) => {
      if (node.type === "paper") {
        const details = [node.year?.toString(), ...(node.fields ?? []).slice(0, 2)].filter(Boolean);
        return details.length > 0 ? details.join(" · ") : t("graph.nodeTypes.paper");
      }
      const paperCount = node.visiblePaperCount ?? node.paperCount;
      return paperCount != null
        ? `${t(`graph.nodeTypes.${node.type}`)} · ${t("graph.context.paperCount", {
            count: paperCount.toLocaleString(),
          })}`
        : t(`graph.nodeTypes.${node.type}`);
    };

    const nodeItems = (items: GraphNode[]) =>
      items
        .slice()
        .sort((a, b) => {
          const sizeDelta = (b.size ?? 0) - (a.size ?? 0);
          return sizeDelta !== 0 ? sizeDelta : a.label.localeCompare(b.label);
        })
        .map((node) => ({
          id: node.id,
          label: node.label,
          meta: formatNodeMeta(node),
        }));

    const edgeItems = (items: GraphEdge[]) =>
      items.map((edge) => {
        const source = nodesById.get(edge.source);
        const target = nodesById.get(edge.target);
        return {
          id: graphEdgeId(edge),
          label: `${source?.label ?? edge.source} -> ${target?.label ?? edge.target}`,
          meta: formatRelationLabel(edge.relation, t),
        };
      });

    const corePapers = filteredNodes.filter(
      (node) => node.type === "paper" && connectedIds.has(node.id)
    );
    const isolatedPapers = filteredNodes.filter(
      (node) => node.type === "paper" && !connectedIds.has(node.id)
    );
    const relationGroups = visibleRelationSummaries.map((relation) => {
      const relationEdges = displayedEdges.filter((edge) => edge.relation === relation.relation);
      const relationNodeIds = new Set<string>();
      relationEdges.forEach((edge) => {
        relationNodeIds.add(edge.source);
        relationNodeIds.add(edge.target);
      });
      const atomNodes = Array.from(relationNodeIds)
        .map((id) => nodesById.get(id))
        .filter((node): node is GraphNode => node != null && node.type !== "paper");

      return {
        id: `relation:${relation.relation}`,
        label: formatRelationLabel(relation.relation, t),
        count: relation.count,
        nodeIds: Array.from(relationNodeIds),
        edgeIds: relationEdges.map(graphEdgeId),
        items: nodeItems(atomNodes),
      };
    });

    return [
      {
        id: "nodes",
        label: t("graph.context.nodes"),
        count: displayedNodes.length,
        nodeIds: displayedNodes.map((node) => node.id),
        edgeIds: displayedEdges.map(graphEdgeId),
        items: nodeItems(displayedNodes),
      },
      {
        id: "edges",
        label: t("graph.context.edges"),
        count: displayedEdges.length,
        nodeIds: Array.from(displayedNodeIds),
        edgeIds: displayedEdges.map(graphEdgeId),
        items: edgeItems(displayedEdges),
      },
      {
        id: "core-papers",
        label: t("graph.context.corePapers"),
        count: corePapers.length,
        nodeIds: corePapers.map((node) => node.id),
        edgeIds: displayedEdges
          .filter((edge) => corePapers.some((node) => node.id === edge.source || node.id === edge.target))
          .map(graphEdgeId),
        items: nodeItems(corePapers),
      },
      {
        id: "isolated-papers",
        label: t("graph.context.isolatedPapers"),
        count: isolatedPapers.length,
        nodeIds: isolatedPapers.map((node) => node.id),
        edgeIds: [],
        items: nodeItems(isolatedPapers),
      },
      ...relationGroups,
    ];
  }, [
    displayedEdges,
    displayedNodeIds,
    displayedNodes,
    filteredEdges,
    filteredNodes,
    graphData,
    t,
    visibleRelationSummaries,
  ]);

  useEffect(() => {
    if (!activeOverviewGroupId) return;
    if (!overviewGroups.some((group) => group.id === activeOverviewGroupId)) {
      setActiveOverviewGroupId(null);
    }
  }, [activeOverviewGroupId, overviewGroups]);

  const focusedOverviewGroup = useMemo(() => {
    const focusedId = hoveredOverviewGroupId ?? activeOverviewGroupId;
    return overviewGroups.find((group) => group.id === focusedId) ?? null;
  }, [activeOverviewGroupId, hoveredOverviewGroupId, overviewGroups]);

  const displayedNodeCount = displayedNodes.length;

  const disabledDepths = useMemo(() => {
    return new Set<number>();
  }, []);

  const depthHint = useMemo(() => {
    if (!graphData) return null;
    if ((graphData.mode === "paper" || graphData.mode === "atom") && graphData.totalPaperNodes <= 1) {
      return t("graph.depthHint.entityNoMore");
    }
    if (graphData.mode === "paper_set") {
      return depth === 1
        ? t("graph.depthHint.level1")
        : depth === 2
          ? paperSetDiagnostics && paperSetDiagnostics.paperNodeCount === paperSetDiagnostics.seedPaperCount
            ? t("graph.depthHint.level2NoNew")
            : t("graph.depthHint.level2")
          : paperSetDiagnostics && paperSetDiagnostics.contextualPaperCount === 0
            ? t("graph.depthHint.level3NoNew")
            : t("graph.depthHint.level3", { count: paperSetDiagnostics?.contextualPaperCount ?? 0 });
    }
    return null;
  }, [depth, graphData, paperSetDiagnostics, t]);

  return (
    <div className="graph-shell">
      <div className="graph-stage graph-stage-app" data-screen-label="Network graph">
        {graphData && graphData.nodes.length > 0 ? (
          <div className="h-full w-full">
            <CytoscapeGraph
              nodes={graphData.nodes}
              edges={graphData.edges}
              layout={layout}
              visibleTypes={visibleTypes}
              showPeripheralPapers={showPeripheralPapers}
              focusNodeIds={focusedOverviewGroup?.nodeIds ?? []}
              focusEdgeIds={focusedOverviewGroup?.edgeIds ?? []}
              onNodeSelect={setSelectedNode}
              onNodeExpand={handleNodeExpand}
            />
          </div>
        ) : (
          <EmptyState
            loading={loading}
            hasSearched={hasSearched}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchSubmit={handleSearchSubmit}
            errorMsg={errorMsg}
          />
        )}

        {loading && graphData && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--paper)]/60 backdrop-blur-sm">
            <div className="lp-card flex flex-col items-center gap-3 rounded-[var(--r-md)] bg-[var(--paper)] px-6 py-5 backdrop-blur-md">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--forest)]" />
              <span className="text-sm font-medium text-[var(--ink-4)]">{t("graph.loading.graph")}</span>
            </div>
          </div>
        )}

        {graphData && graphData.nodes.length > 0 && (
          <GraphToolbar
            title={graphContext?.mode === "paper-set" ? undefined : graphTitle}
            returnTo={graphContext?.returnTo}
            source={graphContext?.source}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchSubmit={handleSearchSubmit}
            depth={depth}
            onDepthChange={handleDepthChange}
            disabledDepths={disabledDepths}
            depthHint={depthHint}
            visibleTypes={visibleTypes}
            onToggleType={handleToggleType}
            showPeripheralPapers={showPeripheralPapers}
            peripheralPaperCount={visiblePaperShape.isolatedPaperCount}
            onTogglePeripheralPapers={() => setShowPeripheralPapers((value) => !value)}
            layout={layout}
            onLayoutChange={setLayout}
            onReset={handleReset}
            nodeCount={displayedNodeCount}
            edgeCount={displayedEdges.length}
          />
        )}

        {graphData && graphData.nodes.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (selectedNode) {
                setSelectedNode(null);
                setOverviewOpen(false);
                return;
              }
              setOverviewOpen((open) => !open);
            }}
            className="lp-card absolute right-4 top-[8.75rem] z-20 hidden h-10 items-center gap-2 rounded-full bg-[var(--paper)] px-3 text-xs font-medium text-[var(--ink-4)] backdrop-blur-md transition hover:text-[var(--ink)] xl:inline-flex"
            title={selectedNode || overviewOpen ? t("graph.context.hideOverview") : t("graph.context.showOverview")}
          >
            {selectedNode || overviewOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
            {selectedNode || overviewOpen ? t("graph.context.hideOverview") : t("graph.context.showOverview")}
          </button>
        )}

        {graphData && graphData.nodes.length > 0 && (overviewOpen || selectedNode) && (
          <div className="absolute right-4 top-[11.75rem] z-10 hidden w-80 max-h-[calc(100vh-16rem)] overflow-y-auto xl:block">
            {selectedNode ? (
            <NodeDetail
              node={selectedNode}
              connections={selectedNodeConnections}
              relatedNodes={selectedRelatedNodes}
              onClose={() => setSelectedNode(null)}
              onExpand={handleNodeExpand}
            />
            ) : (
              <GraphContextPanel
                summary={graphSummary}
                groups={overviewGroups}
                activeGroupId={activeOverviewGroupId}
                onGroupClick={(groupId) =>
                  setActiveOverviewGroupId((current) => (current === groupId ? null : groupId))
                }
                onGroupHover={setHoveredOverviewGroupId}
                onGroupLeave={() => setHoveredOverviewGroupId(null)}
              />
            )}
          </div>
        )}

        {graphData && graphData.nodes.length > 0 && selectedNode && (
          <div className="absolute bottom-4 left-4 right-16 z-20 max-h-[42vh] overflow-y-auto xl:hidden">
            <NodeDetail
              node={selectedNode}
              connections={selectedNodeConnections}
              relatedNodes={selectedRelatedNodes}
              wide
              onClose={() => setSelectedNode(null)}
              onExpand={handleNodeExpand}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  loading,
  hasSearched,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  errorMsg,
}: {
  loading: boolean;
  hasSearched: boolean;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: (v: string, entityType?: string) => void;
  errorMsg: string | null;
}) {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<SearchHit[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fetchSuggestions] = useLazyQuery<{ search: SearchResult }>(SEARCH, {
    fetchPolicy: "network-only",
  });

  // Clear any pending suggestions debounce timeout on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      onSearchChange(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = value.trim();
      if (trimmed.length < 3 || /^w\d+$/i.test(trimmed) || /^[a-z][a-z0-9_]*$/.test(trimmed)) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setSuggestionsLoading(true);
        try {
          const result = await fetchSuggestions({
            variables: { query: trimmed, limit: 6 },
          });
          const hits = result.data?.search?.hits ?? [];
          setSuggestions(hits);
          setShowSuggestions(hits.length > 0);
        } catch {
          setSuggestions([]);
        } finally {
          setSuggestionsLoading(false);
        }
      }, 300);
    },
    [fetchSuggestions, onSearchChange]
  );

  const handleSuggestionClick = useCallback(
    (hit: SearchHit) => {
      setShowSuggestions(false);
      setSuggestions([]);
      onSearchChange(hit.entityId);
      onSearchSubmit(hit.entityId, hit.entityType);
    },
    [onSearchChange, onSearchSubmit]
  );

  const entityTypeColors: Record<string, string> = {
    paper: "#2c4870",
    mechanism: "#b88a3b",
    method: "#15803d",
    dataset: "#2c4870",
    puzzle: "#b54820",
  };

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(126,87,65,0.07),transparent_28%),linear-gradient(180deg,rgba(248,244,236,0.7),rgba(248,244,236,0.28))]">
      <div className="mx-auto max-w-lg px-6">
        <div className="lp-card rounded-[2rem] p-8 text-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--forest)]" />
              <p className="text-sm text-[var(--ink-4)]">{t("graph.loading.network")}</p>
            </div>
          ) : (
            <>
              <div className="lp-card mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[var(--r-md)]">
                <GitBranch className="h-8 w-8 text-[var(--forest)]" />
              </div>
              <p className="section-kicker">{t("graph.empty.kicker")}</p>
              <h2 className="font-display mt-3 text-[clamp(2.1rem,4vw,3.2rem)] text-[var(--ink)]">
                {t("graph.empty.title")}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-4)]">
                {errorMsg
                  ? errorMsg
                  : hasSearched
                    ? t("graph.empty.noResults")
                    : t("graph.empty.start")}
              </p>
              <div className="mt-6">
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setShowSuggestions(false);
                          onSearchSubmit(searchQuery);
                        }
                        if (e.key === "Escape") {
                          setShowSuggestions(false);
                        }
                      }}
                      onFocus={() => {
                        if (suggestions.length > 0) setShowSuggestions(true);
                      }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder={t("graph.empty.searchPlaceholder")}
                      className="flex h-11 w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--paper)] px-4 py-2 text-sm placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-[var(--forest)] focus:ring-offset-2"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="lp-card absolute top-full z-50 mt-2 w-full rounded-[var(--r-md)] py-1.5 ring-1 ring-black/5">
                        <div className="border-b border-[var(--line-soft)] bg-[var(--paper-2)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--forest)]">
                          {t("graph.empty.suggestionsHeader")}
                        </div>
                        {suggestions.map((hit) => (
                          <button
                            key={`${hit.entityType}-${hit.entityId}`}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-[var(--paper-2)]"
                            onMouseDown={() => handleSuggestionClick(hit)}
                          >
                            <span
                              className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10"
                              style={{
                                backgroundColor: entityTypeColors[hit.entityType] ?? "#999",
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium text-[var(--ink)]">
                              {hit.title}
                            </span>
                            <span className="flex-shrink-0 rounded-full bg-[var(--paper)] px-1.5 py-0.5 text-xs font-medium text-[var(--ink-4)]">
                              {t(`graph.nodeTypes.${hit.entityType}`)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {suggestionsLoading && (
                      <div className="absolute right-3 top-3">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-4)]" />
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => {
                      setShowSuggestions(false);
                      onSearchSubmit(searchQuery);
                    }}
                    disabled={!searchQuery.trim()}
                    size="lg"
                    className="gap-2"
                  >
                    <Network className="h-4 w-4" />
                    {t("graph.empty.explore")}
                  </Button>
                </div>
                <p className="text-sm text-[var(--ink-4)] max-w-md mx-auto mt-3">
                  {t("graph.empty.legendHint")}
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-xs text-[var(--ink-4)]">{t("graph.empty.try")}:</span>
                  {[
                    { label: "demo-001", value: "demo-001", entityType: "paper" },
                    { label: "demo-007", value: "demo-007", entityType: "paper" },
                    { label: "search-frictions", value: "search-frictions", entityType: "atom" },
                    { label: "health insurance", value: "health insurance", entityType: undefined },
                  ].map((item) => (
                    <Button
                      key={item.value}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onSearchChange(item.value);
                        onSearchSubmit(item.value, item.entityType);
                      }}
                      className="rounded-full px-3.5 text-xs"
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
