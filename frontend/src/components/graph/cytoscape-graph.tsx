"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import type { LayoutOptions, NodeSingular, Core } from "cytoscape";
import type { GraphNode, GraphEdge } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";
import { HoverPopup } from "./hover-popup";

export type LayoutName =
  | "map"
  | "cose"
  | "circle"
  | "grid"
  | "breadthfirst"
  | "concentric";

interface CytoscapeGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: LayoutName;
  visibleTypes: Set<string>;
  showPeripheralPapers: boolean;
  focusNodeIds?: string[];
  focusEdgeIds?: string[];
  onNodeSelect: (node: GraphNode | null) => void;
  onNodeExpand: (nodeId: string, nodeType: string) => void;
}

// ---------------------------------------------------------------------------
// Colors & sizing
// ---------------------------------------------------------------------------

const NODE_BORDER: Record<string, string> = {
  paper: "#2c4870",
  mechanism: "#8a6d3b",
  method: "#15803d",
  dataset: "#2c4870",
  puzzle: "#8a3318",
};

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

function computeDisplaySize(node: GraphNode, isIsolated = false): number {
  if (isIsolated) {
    return node.type === "paper" ? 24 : 22;
  }
  if (node.type === "paper") {
    // Papers: 40-60px
    const raw = node.size ?? 3;
    return Math.min(60, Math.max(40, 34 + raw * 4));
  }
  if (node.type === "puzzle") {
    // Puzzles: 22-34px
    return Math.min(34, Math.max(22, 20 + (node.size ?? 1) * 3));
  }
  // Mechanisms, methods, datasets: 28-40px
  const raw = node.size ?? 1;
  return Math.min(40, Math.max(28, 24 + raw * 3));
}

function truncateLabel(label: string, max: number = 35): string {
  if (label.length <= max) return label;
  return label.substring(0, max - 1) + "…";
}

function buildMapPositions(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const degree = new Map<string, number>();
  nodes.forEach((node) => degree.set(node.id, 0));
  edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  });

  const connected = nodes
    .filter((node) => (degree.get(node.id) ?? 0) > 0)
    .sort((a, b) => {
      const degreeDelta = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
      if (degreeDelta !== 0) return degreeDelta;
      if (a.type === b.type) return a.label.localeCompare(b.label);
      return a.type === "paper" ? 1 : -1;
    });
  const isolated = nodes
    .filter((node) => (degree.get(node.id) ?? 0) === 0)
    .sort((a, b) => {
      if (Boolean(a.isSeed) !== Boolean(b.isSeed)) return a.isSeed ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

  const positions = new Map<string, { x: number; y: number }>();
  const atoms = connected.filter((node) => node.type !== "paper");
  const papers = connected.filter((node) => node.type === "paper");
  const atomRadius = atoms.length > 10 ? 185 : 135;
  const paperRadius = papers.length > 18 ? 390 : 300;

  atoms.forEach((node, index) => {
    const angle = atoms.length <= 1 ? 0 : (index / atoms.length) * Math.PI * 2 - Math.PI / 2;
    const radius = atomRadius + Math.floor(index / 14) * 72;
    positions.set(node.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius - 20,
    });
  });

  papers.forEach((node, index) => {
    const angle = papers.length <= 1 ? -Math.PI / 2 : (index / papers.length) * Math.PI * 2 - Math.PI / 2;
    const radius = paperRadius + Math.floor(index / 24) * 80;
    positions.set(node.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius + 10,
    });
  });

  const columns = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(Math.max(isolated.length, 1)) * 1.35)));
  const cellWidth = 118;
  const cellHeight = 78;
  const startX = -((columns - 1) * cellWidth) / 2;
  const startY = 520;
  isolated.forEach((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    positions.set(node.id, {
      x: startX + col * cellWidth,
      y: startY + row * cellHeight,
    });
  });

  return positions;
}

// ---------------------------------------------------------------------------
// Stylesheet — the key to a good-looking graph
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const graphStylesheet: any[] = [
  // --- Default node ---
  {
    selector: "node",
    style: {
      label: "data(displayLabel)",
      // Label positioning: offset below the node with padding
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 10,
      "font-size": "13px",
      "font-family": "\"Source Sans 3\", system-ui, sans-serif",
      color: "#ece8df",
      "text-max-width": "180px",
      "text-wrap": "ellipsis",
      "text-background-color": "#111820",
      "text-background-opacity": 0.9,
      "text-background-padding": "4px",
      "text-background-shape": "roundrectangle",
      "min-zoomed-font-size": 6,
      // Node sizing
      width: "data(displaySize)",
      height: "data(displaySize)",
      // Border
      "border-width": 2.5,
      "border-color": "data(borderColor)",
      "border-opacity": 1,
      // Overlay
      "overlay-padding": "6px",
    },
  },
  // --- Paper nodes ---
  {
    selector: 'node[type="paper"]',
    style: {
      "background-color": "#2c4870",
      "background-opacity": 0.9,
      "border-color": "#2c4870",
      "border-width": 3,
      shape: "ellipse",
      "font-size": "14px",
      "font-family": "\"Fraunces\", Georgia, serif",
      "text-background-color": "#111820",
      "text-background-opacity": 0.92,
    },
  },
  {
    selector: "node[isIsolated = 1]",
    style: {
      width: "data(displaySize)",
      height: "data(displaySize)",
      opacity: 0.72,
      "text-opacity": 0.42,
      "font-size": "10px",
      "text-max-width": "96px",
      "text-background-opacity": 0.58,
      "border-width": 1.5,
    },
  },
  // --- Mechanism nodes ---
  {
    selector: 'node[type="mechanism"]',
    style: {
      "background-color": "#b88a3b",
      "background-opacity": 0.85,
      "border-color": "#8a6d3b",
      shape: "diamond",
    },
  },
  // --- Method nodes ---
  {
    selector: 'node[type="method"]',
    style: {
      "background-color": "#15803d",
      "background-opacity": 0.85,
      "border-color": "#15803d",
      shape: "round-rectangle",
    },
  },
  // --- Dataset nodes ---
  {
    selector: 'node[type="dataset"]',
    style: {
      "background-color": "#2c4870",
      "background-opacity": 0.85,
      "border-color": "#2c4870",
      shape: "hexagon",
    },
  },
  // --- Puzzle nodes ---
  {
    selector: 'node[type="puzzle"]',
    style: {
      "background-color": "#b54820",
      "background-opacity": 0.85,
      "border-color": "#8a3318",
      shape: "triangle",
    },
  },
  // --- Edges ---
  {
    selector: "edge",
    style: {
      width: "mapData(weight, 1, 5, 2, 5)",
      "line-color": "#d8d3c4",
      "curve-style": "bezier",
      opacity: 0.5,
      "target-arrow-shape": "none",
    },
  },
  {
    selector: "node[isSeed = 1]",
    style: {
      "border-width": 4,
      "border-style": "double",
    },
  },
  // --- Selected node ---
  {
    selector: "node:selected",
    style: {
      "border-width": 4,
      "border-color": "#0a0a0a",
      "overlay-color": "#2c4870",
      "overlay-opacity": 0.12,
      "font-size": "16px",
      "text-background-opacity": 1,
      "text-opacity": 1,
    },
  },
  // --- Highlighted edges (connected to selected) ---
  {
    selector: "edge.highlighted",
    style: {
      "line-color": "#2c4870",
      label: "data(relationLabel)",
      width: 3.5,
      opacity: 0.9,
      "font-size": "11px",
      "font-family": "\"Source Sans 3\", system-ui, sans-serif",
      color: "#f3f1ea",
      "text-background-color": "#101720",
      "text-background-opacity": 0.96,
      "text-background-padding": "3px",
      "text-background-shape": "roundrectangle",
      "text-rotation": "autorotate",
    },
  },
  {
    selector: "node.focused",
    style: {
      opacity: 1,
      "text-opacity": 1,
      "text-background-opacity": 1,
      "border-width": 4,
    },
  },
  // --- Dimmed elements ---
  {
    selector: "node.dimmed",
    style: {
      opacity: 0.2,
      "text-opacity": 0.15,
    },
  },
  {
    selector: "edge.dimmed",
    style: {
      opacity: 0.06,
    },
  },
  {
    selector: "node.categoryDimmed",
    style: {
      opacity: 0.18,
      "text-opacity": 0.08,
      "text-background-opacity": 0.28,
    },
  },
  {
    selector: "edge.categoryDimmed",
    style: {
      opacity: 0.04,
    },
  },
  {
    selector: "node.categoryFocused",
    style: {
      opacity: 1,
      "text-opacity": 1,
      "text-background-opacity": 0.96,
      "border-width": 4,
      "overlay-color": "#fafaf7",
      "overlay-opacity": 0.08,
    },
  },
  {
    selector: "edge.categoryHighlighted",
    style: {
      "line-color": "#fafaf7",
      width: 4,
      opacity: 0.92,
    },
  },
];

// ---------------------------------------------------------------------------
// Layout configs
// ---------------------------------------------------------------------------

function getLayoutConfig(name: LayoutName, nodeCount: number): LayoutOptions {
  const isLarge = nodeCount > 60;
  const isMedium = nodeCount > 25;

  switch (name) {
    case "cose":
      return {
        name: "cose",
        animate: true,
        animationDuration: 600,
        nodeRepulsion: () => (isLarge ? 70000 : isMedium ? 56000 : 42000),
        idealEdgeLength: () => (isLarge ? 165 : isMedium ? 145 : 120),
        edgeElasticity: () => 180,
        gravity: isLarge ? 0.13 : isMedium ? 0.1 : 0.08,
        nestingFactor: 1.2,
        numIter: 1800,
        padding: 100,
        randomize: false,
        fit: true,
        componentSpacing: isLarge ? 95 : 80,
        nodeDimensionsIncludeLabels: true,
      } as LayoutOptions;
    case "map":
      return {
        name: "preset",
        animate: true,
        animationDuration: 450,
        fit: false,
        padding: 90,
      } as LayoutOptions;
    case "circle":
      return {
        name: "circle",
        padding: 80,
        animate: true,
        animationDuration: 500,
        nodeDimensionsIncludeLabels: true,
      } as LayoutOptions;
    case "grid":
      return {
        name: "grid",
        padding: 80,
        animate: true,
        animationDuration: 500,
        nodeDimensionsIncludeLabels: true,
      } as LayoutOptions;
    case "breadthfirst":
      return {
        name: "breadthfirst",
        padding: 80,
        spacingFactor: 2.5,
        animate: true,
        animationDuration: 500,
        nodeDimensionsIncludeLabels: true,
      } as LayoutOptions;
    case "concentric":
      return {
        name: "concentric",
        padding: 80,
        minNodeSpacing: 100,
        animate: true,
        animationDuration: 500,
        concentric: (node: NodeSingular) => node.degree(false),
        levelWidth: () => 2,
        nodeDimensionsIncludeLabels: true,
      } as LayoutOptions;
    default:
      return { name: "cose", padding: 80 };
  }
}

function focusGraph(cy: Core, layout: LayoutName) {
  if (layout === "map") {
    const coreNodes = cy.nodes("[isIsolated = 0]");
    if (coreNodes.length > 0) {
      cy.fit(coreNodes, 130);
      cy.panBy({ x: 0, y: 46 });
      if (cy.zoom() > 1.15) {
        cy.zoom({
          level: 1.15,
          renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
        });
      }
      return;
    }
  }

  cy.fit(undefined, 70);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HoverNodeState {
  id: string;
  label: string;
  type: string;
  size?: number;
  year?: number | null;
  theme?: string | null;
  paperCount?: number | null;
  visiblePaperCount?: number | null;
  isSeed?: boolean;
  position: { x: number; y: number };
}

export function CytoscapeGraph({
  nodes,
  edges,
  layout,
  visibleTypes,
  showPeripheralPapers,
  focusNodeIds = [],
  focusEdgeIds = [],
  onNodeSelect,
  onNodeExpand,
}: CytoscapeGraphProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const prevKeyRef = useRef<string>("");
  const [hoverNode, setHoverNode] = useState<HoverNodeState | null>(null);

  // Build elements from props
  const buildElements = useCallback(() => {
    const typeVisibleNodes = nodes.filter((n) => visibleTypes.has(n.type));
    const typeVisibleNodeIds = new Set(typeVisibleNodes.map((n) => n.id));
    const typeVisibleEdges = edges.filter(
      (e) => typeVisibleNodeIds.has(e.source) && typeVisibleNodeIds.has(e.target)
    );
    const degree = new Map<string, number>();
    typeVisibleNodes.forEach((node) => degree.set(node.id, 0));
    typeVisibleEdges.forEach((edge) => {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    });
    const filteredNodes = showPeripheralPapers
      ? typeVisibleNodes
      : typeVisibleNodes.filter((node) => node.type !== "paper" || (degree.get(node.id) ?? 0) > 0);
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = typeVisibleEdges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );
    const positions = layout === "map" ? buildMapPositions(filteredNodes, filteredEdges) : null;

    return [
      ...filteredNodes.map((node) => {
        const isIsolated = (degree.get(node.id) ?? 0) === 0;
        const displayLabel = isIsolated
          ? ""
          : node.type === "paper"
            ? truncateLabel(node.label, 42)
            : truncateLabel(node.label, 32);

        return {
          data: {
            id: node.id,
            label: node.label,
            displayLabel,
            type: node.type,
            size: node.size ?? (node.type === "paper" ? 3 : 1),
            displaySize: computeDisplaySize(node, isIsolated),
            borderColor: NODE_BORDER[node.type] ?? "#807968",
            year: node.year ?? null,
            fields: node.fields ?? [],
            theme: node.theme ?? null,
            paperCount: node.paperCount ?? null,
            visiblePaperCount: node.visiblePaperCount ?? null,
            isSeed: node.isSeed ? 1 : 0,
            isIsolated: isIsolated ? 1 : 0,
          },
          ...(positions?.has(node.id) ? { position: positions.get(node.id) } : {}),
        };
      }),
      ...filteredEdges.map((edge) => ({
        data: {
          id: `${edge.source}-${edge.target}-${edge.relation}`,
          source: edge.source,
          target: edge.target,
          relation: edge.relation,
          relationLabel: formatRelationLabel(edge.relation, t),
          weight: edge.weight ?? 1,
        },
      })),
    ];
  }, [nodes, edges, layout, showPeripheralPapers, t, visibleTypes]);

  // Attach all event listeners to a cy instance
  const attachEvents = useCallback(
    (cy: Core) => {
      // Click node: select and highlight
      cy.on("tap", "node", (evt) => {
        const node = evt.target;
        const nodeData: GraphNode = {
          id: node.data("id"),
          label: node.data("label"),
          type: node.data("type"),
          size: node.data("size"),
          year: node.data("year"),
          fields: node.data("fields"),
          theme: node.data("theme"),
          paperCount: node.data("paperCount"),
          visiblePaperCount: node.data("visiblePaperCount"),
          isSeed: Boolean(node.data("isSeed")),
        };
        cy.elements().removeClass("highlighted dimmed focused categoryDimmed categoryFocused categoryHighlighted");
        const connEdges = node.connectedEdges();
        const connNodes = connEdges.connectedNodes();
        cy.elements().addClass("dimmed");
        node.removeClass("dimmed").addClass("focused");
        connNodes.removeClass("dimmed").addClass("focused");
        connEdges.removeClass("dimmed").addClass("highlighted");
        onNodeSelect(nodeData);
      });

      // Click background: deselect
      cy.on("tap", (evt) => {
        if (evt.target === cy) {
          cy.elements().removeClass("highlighted dimmed focused categoryDimmed categoryFocused categoryHighlighted");
          onNodeSelect(null);
        }
      });

      // Double-click: expand
      cy.on("dbltap", "node", (evt) => {
        const node = evt.target;
        onNodeExpand(node.data("id"), node.data("type"));
      });

      // Hover popup
      cy.on("mouseover", "node", (evt) => {
        const node = evt.target;
        const rendered = node.renderedPosition();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setHoverNode({
          id: node.data("id"),
          label: node.data("label"),
          type: node.data("type"),
          size: node.data("size"),
          year: node.data("year"),
          theme: node.data("theme"),
          paperCount: node.data("paperCount"),
          visiblePaperCount: node.data("visiblePaperCount"),
          isSeed: Boolean(node.data("isSeed")),
          position: { x: rect.left + rendered.x, y: rect.top + rendered.y },
        });
      });

      cy.on("mouseout", "node", () => setHoverNode(null));
      cy.on("viewport", () => setHoverNode(null));
    },
    [onNodeSelect, onNodeExpand]
  );

  // Main init/update effect
  useEffect(() => {
    const key = JSON.stringify({
      nodes: nodes
        .map((node) => ({
          id: node.id,
          type: node.type,
          label: node.label,
          size: node.size ?? null,
          year: node.year ?? null,
          theme: node.theme ?? null,
          paperCount: node.paperCount ?? null,
          visiblePaperCount: node.visiblePaperCount ?? null,
          isSeed: Boolean(node.isSeed),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      edges: edges
        .map((edge) => ({
          source: edge.source,
          target: edge.target,
          relation: edge.relation,
          weight: edge.weight ?? null,
        }))
        .sort((a, b) => {
          const left = `${a.source}|${a.target}|${a.relation}`;
          const right = `${b.source}|${b.target}|${b.relation}`;
          return left.localeCompare(right);
        }),
      ly: layout,
      vt: Array.from(visibleTypes).sort().join(","),
      peripheral: showPeripheralPapers,
    });

    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    (async () => {
      // Destroy previous instance
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      if (!containerRef.current) return;

      const cytoscape = (await import("cytoscape")).default;
      const elements = buildElements();

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: graphStylesheet,
        minZoom: 0.1,
        maxZoom: 5,
        boxSelectionEnabled: true,
        selectionType: "single",
      });

      const nodeCount = elements.filter((e) => !("source" in e.data)).length;
      const layoutConfig = getLayoutConfig(layout, nodeCount);
      const layoutInstance = cy.layout(layoutConfig);
      layoutInstance.run();
      layoutInstance.on("layoutstop", () => focusGraph(cy, layout));

      attachEvents(cy);
      cyRef.current = cy;
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, layout, visibleTypes, showPeripheralPapers, t]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass("categoryDimmed categoryFocused categoryHighlighted");
    if (focusNodeIds.length === 0 && focusEdgeIds.length === 0) return;

    const nodeIdSet = new Set(focusNodeIds);
    const edgeIdSet = new Set(focusEdgeIds);
    cy.elements().addClass("categoryDimmed");

    nodeIdSet.forEach((id) => {
      const node = cy.getElementById(id);
      if (node.nonempty()) {
        node.removeClass("categoryDimmed").addClass("categoryFocused");
      }
    });

    edgeIdSet.forEach((id) => {
      const edge = cy.getElementById(id);
      if (edge.nonempty()) {
        edge.removeClass("categoryDimmed").addClass("categoryHighlighted");
        edge.connectedNodes().removeClass("categoryDimmed").addClass("categoryFocused");
      }
    });
  }, [focusEdgeIds, focusNodeIds]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, []);

  // Resize
  useEffect(() => {
    const onResize = () => {
      if (cyRef.current) {
        cyRef.current.resize();
        focusGraph(cyRef.current, layout);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [layout]);

  const handleFit = useCallback(() => {
    if (cyRef.current) focusGraph(cyRef.current, layout);
  }, [layout]);
  const handleZoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);
  const handleZoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.zoom({ level: cy.zoom() / 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  return (
    <div className="relative h-full w-full" style={{ minHeight: "400px" }}>
      <div ref={containerRef} className="h-full w-full" />

      {/* Hover popup */}
      {hoverNode && (
        <HoverPopup
          node={hoverNode}
          position={hoverNode.position}
        />
      )}

      {/* Zoom controls — vertical stack, bottom-right */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5">
        <button
          onClick={handleFit}
          className="lp-card flex h-10 w-10 items-center justify-center rounded-[var(--r-md)] bg-[var(--paper)] text-[var(--ink-4)] backdrop-blur-sm transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
          title={t("graph.zoom.fit")}
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4" />
          </svg>
        </button>
        <button
          onClick={handleZoomIn}
          className="lp-card flex h-10 w-10 items-center justify-center rounded-[var(--r-md)] bg-[var(--paper)] text-lg font-medium text-[var(--ink-4)] backdrop-blur-sm transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
          title={t("graph.zoom.in")}
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="lp-card flex h-10 w-10 items-center justify-center rounded-[var(--r-md)] bg-[var(--paper)] text-lg font-medium text-[var(--ink-4)] backdrop-blur-sm transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
          title={t("graph.zoom.out")}
        >
          −
        </button>
      </div>

    </div>
  );
}
