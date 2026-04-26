"use client";

import React, { Suspense, useState, useCallback, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useLazyQuery } from "@apollo/client/react";
import { ArrowLeft, Loader2, Network, GitBranch, Info } from "lucide-react";
import {
  GET_PAPER_NETWORK,
  GET_ATOM_NEIGHBORHOOD,
  GET_PAPER_SET_NETWORK,
  RESEARCH_PAPERS,
  SEARCH,
} from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { GraphControls } from "@/components/graph/graph-controls";
import { NodeDetail } from "@/components/graph/node-detail";
import type { LayoutName } from "@/components/graph/cytoscape-graph";
import type {
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

function getSourceLabel(source?: string | null): string {
  switch (source) {
    case "research":
      return "Back to Research";
    case "paper":
      return "Back to Paper";
    case "ask":
      return "Back to Ask";
    case "project":
      return "Back to Project";
    case "latest":
      return "Back to Latest Research";
    default:
      return "Back";
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

const GRAPH_NODE_LEGEND = [
  { label: "Papers", shape: "circle", color: "#3b82f6" },
  { label: "Methods", shape: "square", color: "#22c55e" },
  { label: "Datasets", shape: "hexagon", color: "#a855f7" },
  { label: "Mechanisms", shape: "diamond", color: "#f97316" },
  { label: "Puzzles", shape: "triangle", color: "#ef4444" },
] as const;

function formatRelationLabel(relation: string): string {
  return relation
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function GraphLegend({
  relationSummaries,
}: {
  relationSummaries: NodeConnectionSummary[];
}) {
  return (
    <div className="paper-panel absolute bottom-4 left-4 z-10 max-w-[280px] rounded-[1.35rem] px-4 py-3">
      <p className="section-kicker">Reading key</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {GRAPH_NODE_LEGEND.map((item) => (
          <div
            key={item.label}
            className="inline-flex items-center gap-2 rounded-full bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            <span
              className="inline-block h-2.5 w-2.5 shrink-0"
              style={{
                backgroundColor: item.color,
                borderRadius:
                  item.shape === "circle"
                    ? "999px"
                    : item.shape === "square"
                      ? "4px"
                      : item.shape === "diamond"
                        ? "2px"
                        : "0",
                clipPath:
                  item.shape === "triangle"
                    ? "polygon(50% 0%, 0% 100%, 100% 100%)"
                    : item.shape === "hexagon"
                      ? "polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)"
                      : item.shape === "diamond"
                        ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)"
                        : undefined,
              }}
            />
            {item.label}
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        <p className="text-xs font-medium text-foreground">Visible relations</p>
        {relationSummaries.length > 0 ? (
          relationSummaries.slice(0, 4).map((item) => (
            <div key={item.relation} className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{formatRelationLabel(item.relation)}</span>
              <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-foreground">
                {item.count}
              </span>
            </div>
          ))
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Select a node to see which relation types are active around it.
          </p>
        )}
      </div>
    </div>
  );
}

function GraphSummaryCard({ summary }: { summary: string }) {
  return (
    <div className="paper-panel max-w-[360px] rounded-[1.2rem] px-4 py-3">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="section-kicker">Graph scope</p>
          <p className="text-xs leading-relaxed text-foreground/90">{summary}</p>
        </div>
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
  const initialQuery = (searchParams.get("q") ?? "").trim();
  const initialMode = (searchParams.get("mode") ?? "").trim();
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
    initialMode === "paper-set" && initialContextQuery
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
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
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
          setErrorMsg("No results found for that paper ID.");
          setSearchMessage(net?.warningMessage ?? null);
          setGraphData(null);
        } else {
          const paperNodeCount = net.nodes.filter((node) => node.type === "paper").length;
          setErrorMsg(null);
          setSearchMessage(
            net.warningMessage
              ? net.warningMessage
              : paperNodeCount <= 1
              ? `"${nextContext?.label ?? paperId}" is currently linked only to atoms that are unique to this paper in the knowledge base, so depth 2 and 3 will match depth 1. Try topic keywords to open a broader paper-set graph.`
              : net.nodes.length <= 1 || net.edges.length === 0
                ? `"${nextContext?.label ?? paperId}" does not yet have structured graph links. Try topic keywords to open a broader paper-set graph.`
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
        setErrorMsg(err instanceof Error ? err.message : "Failed to load paper network.");
        setGraphData(null);
      }
      setHasSearched(true);
    },
    [fetchPaperNetwork, graphContext, initialReturnTo, initialSource]
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
          setErrorMsg("No results found for that atom slug.");
          setSearchMessage(net?.warningMessage ?? null);
          setGraphData(null);
        } else {
          setErrorMsg(null);
          setSearchMessage(
            net.warningMessage
              ? net.warningMessage
              : net.nodes.length <= 1 || net.edges.length === 0
              ? `"${nextContext?.label ?? slug}" does not yet connect to a larger visible neighborhood.`
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
        setErrorMsg(err instanceof Error ? err.message : "Failed to load atom neighborhood.");
        setGraphData(null);
      }
      setHasSearched(true);
    },
    [fetchAtomNeighborhood, graphContext, initialReturnTo, initialSource]
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
          setErrorMsg("No graphable structure was found for the current paper set.");
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
        setErrorMsg(err instanceof Error ? err.message : "Failed to load paper-set network.");
        setGraphData(null);
      }
      setHasSearched(true);
    },
    [fetchPaperSetNetwork]
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
          setErrorMsg(`No matched papers found for "${trimmedQuery}".`);
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
            : "Failed to build a graph for the current research scope."
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
    ]
  );

  const handleSearchSubmit = useCallback(
    async (value: string) => {
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

      if (/^w\d+$/i.test(trimmed)) {
        await loadPaperNetwork(trimmed.toLowerCase(), depth, {
          label: trimmed.toLowerCase(),
          ...inheritedContext,
        });
        return;
      }

      if (/^[a-z][a-z0-9_]*$/.test(trimmed)) {
        await loadAtomNeighborhood(trimmed, depth, {
          label: trimmed,
          ...inheritedContext,
        });
        return;
      }

      setSearchMessage(
        `Showing a topic graph for "${trimmed}". Use a paper ID or atom slug if you want a single-entity neighborhood instead.`
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
    ]
  );

  const initialSearchDone = useRef(false);
  useEffect(() => {
    if (initialSearchDone.current) return;

    if (initialMode === "paper-set" && initialContextQuery) {
      initialSearchDone.current = true;
      const timer = window.setTimeout(() => {
        void loadResearchContextGraph(initialContextQuery, initialFilters, depth, {
          label: initialLabel || initialContextQuery,
          source: initialSource,
          returnTo: initialReturnTo,
        });
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (initialMode === "paper-ids" && initialPaperIds.length > 0) {
      initialSearchDone.current = true;
      const timer = window.setTimeout(() => {
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
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (initialQuery) {
      initialSearchDone.current = true;
      const timer = window.setTimeout(() => {
        void handleSearchSubmit(initialQuery);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [
    depth,
    handleSearchSubmit,
    initialContextQuery,
    initialFilters,
    initialLabel,
    initialMode,
    initialPaperIds,
    initialQuery,
    initialReturnTo,
    initialSource,
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
      const label = graphContext?.label || paperSetScope?.label || "Research Graph";
      const sourcePaperCount = graphData.sourcePaperCount ?? paperSetScope?.paperIds.length ?? 0;
      const truncationNote = graphData.truncated
        ? ` Showing the first ${graphData.seedCount} seed papers to keep the graph readable.`
        : "";
      const isolationNote =
        paperSetDiagnostics && paperSetDiagnostics.isolatedSeedCount > 0
          ? ` ${paperSetDiagnostics.isolatedSeedCount} seed paper${paperSetDiagnostics.isolatedSeedCount === 1 ? " is" : "s are"} currently isolated because they do not share visible atoms with the connected core.`
          : "";
      const depthNote =
        depth === 1
          ? "Depth 1 keeps only atoms shared within the current seed set."
          : depth === 2
            ? paperSetDiagnostics && paperSetDiagnostics.paperNodeCount === paperSetDiagnostics.seedPaperCount
              ? "Depth 2 added atoms around the seed papers, but no additional paper nodes surfaced in the current library."
              : "Depth 2 adds all atoms attached to the current seed papers."
            : paperSetDiagnostics && paperSetDiagnostics.contextualPaperCount === 0
              ? "Depth 3 looked for outside papers through the visible atoms, but none were found yet."
              : `Depth 3 adds contextual outside papers linked through the visible atoms. ${paperSetDiagnostics?.contextualPaperCount ?? 0} outside paper${paperSetDiagnostics?.contextualPaperCount === 1 ? "" : "s"} added in this view.`;
      return `${label} · ${sourcePaperCount.toLocaleString()} matched papers · ${graphData.seedCount} seed papers · ${graphData.totalPaperNodes} paper nodes in view.${truncationNote} ${depthNote}${isolationNote}`;
    }

    return searchMessage;
  }, [depth, graphContext, graphData, paperSetDiagnostics, paperSetScope, searchMessage]);

  const disabledDepths = useMemo(() => {
    if (!graphData) return new Set<number>();
    if ((graphData.mode === "paper" || graphData.mode === "atom") && graphData.totalPaperNodes <= 1) {
      return new Set([2, 3]);
    }
    return new Set<number>();
  }, [graphData]);

  const depthHint = useMemo(() => {
    if (!graphData) return null;
    if ((graphData.mode === "paper" || graphData.mode === "atom") && graphData.totalPaperNodes <= 1) {
      return "No additional papers are connected through the current entity yet, so deeper hops will not change this graph.";
    }
    if (graphData.mode === "paper_set") {
      return depth === 1
        ? "Depth 1 keeps only atoms shared within the current seed set."
        : depth === 2
          ? paperSetDiagnostics && paperSetDiagnostics.paperNodeCount === paperSetDiagnostics.seedPaperCount
            ? "Depth 2 expanded the seed papers into their attached atoms, but it did not reveal any additional paper nodes."
            : "Depth 2 adds all atoms attached to the visible seed papers."
          : paperSetDiagnostics && paperSetDiagnostics.contextualPaperCount === 0
            ? "Depth 3 tried to bring in outside papers through the visible atoms, but none were found in the current library."
            : `Depth 3 adds outside papers linked through the visible atoms. ${paperSetDiagnostics?.contextualPaperCount ?? 0} outside paper${paperSetDiagnostics?.contextualPaperCount === 1 ? "" : "s"} are currently visible.`;
    }
    return null;
  }, [depth, graphData, paperSetDiagnostics]);

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] flex-col lg:-m-8">
      <div className="relative flex-1">
        {graphData && graphData.nodes.length > 0 ? (
          <div className="h-full w-full">
            <CytoscapeGraph
              nodes={graphData.nodes}
              edges={graphData.edges}
              layout={layout}
              visibleTypes={visibleTypes}
              onNodeSelect={setSelectedNode}
              onNodeExpand={handleNodeExpand}
            />
            <GraphLegend relationSummaries={selectedNodeConnections} />
            <div className="paper-panel absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              Click a node for details · Double-click to re-center
            </div>
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
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="paper-panel flex flex-col items-center gap-3 rounded-[1.4rem] bg-background/90 px-6 py-5 backdrop-blur-md">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Loading graph...</span>
            </div>
          </div>
        )}

        {graphData && graphData.nodes.length > 0 && (
          <div className="absolute left-4 top-4 z-10 flex flex-col gap-3">
            {graphContext?.returnTo ? (
              <Button asChild variant="outline" size="sm" className="justify-start gap-1.5 bg-background/90 backdrop-blur-md">
                <Link href={graphContext.returnTo}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {getSourceLabel(graphContext.source)}
                </Link>
              </Button>
            ) : null}

            {graphSummary ? <GraphSummaryCard summary={graphSummary} /> : null}

            <GraphControls
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSearchSubmit={handleSearchSubmit}
              depth={depth}
              onDepthChange={handleDepthChange}
              disabledDepths={disabledDepths}
              depthHint={depthHint}
              visibleTypes={visibleTypes}
              onToggleType={handleToggleType}
              layout={layout}
              onLayoutChange={setLayout}
              onReset={handleReset}
              nodeCount={filteredNodes.length}
              edgeCount={filteredEdges.length}
              nodes={graphData.nodes}
            />
          </div>
        )}

        {selectedNode && (
          <div className="absolute right-4 top-4 z-10">
            <NodeDetail
              node={selectedNode}
              connections={selectedNodeConnections}
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
  onSearchSubmit: (v: string) => void;
  errorMsg: string | null;
}) {
  const [suggestions, setSuggestions] = useState<SearchHit[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fetchSuggestions] = useLazyQuery<{ search: SearchResult }>(SEARCH, {
    fetchPolicy: "network-only",
  });

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
      onSearchSubmit(hit.entityId);
    },
    [onSearchChange, onSearchSubmit]
  );

  const entityTypeColors: Record<string, string> = {
    paper: "#3b82f6",
    mechanism: "#f97316",
    method: "#22c55e",
    dataset: "#a855f7",
    puzzle: "#ef4444",
  };

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(126,87,65,0.07),transparent_28%),linear-gradient(180deg,rgba(248,244,236,0.7),rgba(248,244,236,0.28))]">
      <div className="mx-auto max-w-lg px-6">
        <div className="paper-panel rounded-[2rem] p-8 text-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading network data...</p>
            </div>
          ) : (
            <>
              <div className="paper-panel mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.3rem]">
                <GitBranch className="h-8 w-8 text-primary" />
              </div>
              <p className="section-kicker">Graph workspace</p>
              <h2 className="font-display mt-3 text-[clamp(2.1rem,4vw,3.2rem)] text-foreground">
                Explore the Knowledge Graph
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {errorMsg
                  ? errorMsg
                  : hasSearched
                    ? "No results found. Try a different search term."
                    : "Search by topic keywords to open a paper-set graph. Use a paper ID or atom slug when you want a single-entity neighborhood instead."}
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
                      placeholder='e.g., "medical device", w31161, or staggered_did'
                      className="flex h-11 w-full rounded-[1rem] border border-input bg-background/80 px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="paper-panel absolute top-full z-50 mt-2 w-full rounded-[1rem] py-1.5 ring-1 ring-black/5">
                        <div className="border-b border-border bg-[color:oklch(var(--accent)/0.45)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                          Search results, click to explore network
                        </div>
                        {suggestions.map((hit) => (
                          <button
                            key={`${hit.entityType}-${hit.entityId}`}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-[color:oklch(var(--accent)/0.45)]"
                            onMouseDown={() => handleSuggestionClick(hit)}
                          >
                            <span
                              className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10"
                              style={{
                                backgroundColor: entityTypeColors[hit.entityType] ?? "#999",
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                              {hit.title}
                            </span>
                            <span className="flex-shrink-0 rounded-full bg-background/85 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                              {hit.entityType}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {suggestionsLoading && (
                      <div className="absolute right-3 top-3">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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
                    Explore
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mt-3">
                  The knowledge graph connects papers (blue circles) to their methods (green rectangles),
                  datasets (purple diamonds), mechanisms (orange hexagons), and puzzles (red triangles).
                  Higher depth shows more connections.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-xs text-muted-foreground">Try:</span>
                  {[
                    { label: "w31161", value: "w31161" },
                    { label: "w29691", value: "w29691" },
                    { label: "medical device", value: "medical device" },
                    { label: "health insurance", value: "health insurance" },
                  ].map((item) => (
                    <Button
                      key={item.value}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onSearchChange(item.value);
                        onSearchSubmit(item.value);
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
