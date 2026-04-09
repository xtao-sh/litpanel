"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import type { LayoutOptions, NodeSingular, Core } from "cytoscape";
import type { GraphNode, GraphEdge } from "@/lib/types";
import { HoverPopup } from "./hover-popup";

export type LayoutName =
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
  onNodeSelect: (node: GraphNode | null) => void;
  onNodeExpand: (nodeId: string, nodeType: string) => void;
}

// ---------------------------------------------------------------------------
// Colors & sizing
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<string, string> = {
  paper: "#3b82f6",
  mechanism: "#f97316",
  method: "#16a34a",
  dataset: "#9333ea",
  puzzle: "#dc2626",
};

const NODE_BORDER: Record<string, string> = {
  paper: "#2563eb",
  mechanism: "#ea580c",
  method: "#15803d",
  dataset: "#7e22ce",
  puzzle: "#b91c1c",
};

function computeDisplaySize(node: GraphNode): number {
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

// ---------------------------------------------------------------------------
// Stylesheet — the key to a good-looking graph
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const graphStylesheet: any[] = [
  // --- Default node ---
  {
    selector: "node",
    style: {
      label: "data(shortLabel)",
      // Label positioning: offset below the node with padding
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 10,
      // Font — large and readable
      "font-size": "18px",
      "font-family": "Inter, system-ui, sans-serif",
      "font-weight": "700",
      color: "#0f172a",
      // Constrain label width — single line with ellipsis, NOT wrapping
      "text-max-width": "220px",
      "text-wrap": "ellipsis",
      // Text background (halo) — makes labels readable over edges
      "text-background-color": "#ffffff",
      "text-background-opacity": 0.95,
      "text-background-padding": "6px",
      "text-background-shape": "roundrectangle",
      // Hide labels when zoomed out far
      "min-zoomed-font-size": 4,
      // Node sizing
      width: "data(displaySize)",
      height: "data(displaySize)",
      // Border
      "border-width": 2.5,
      "border-color": "data(borderColor)",
      "border-opacity": 1,
      // Subtle shadow on all nodes
      "shadow-blur": 4,
      "shadow-color": "#00000020",
      "shadow-offset-x": 0,
      "shadow-offset-y": 2,
      "shadow-opacity": 0.3,
      // Overlay
      "overlay-padding": "6px",
    },
  },
  // --- Paper nodes ---
  {
    selector: 'node[type="paper"]',
    style: {
      "background-color": "#3b82f6",
      "background-opacity": 0.9,
      "border-color": "#2563eb",
      "border-width": 3,
      shape: "ellipse",
      "font-size": "20px",
      "font-weight": "700",
      "text-background-color": "#eff6ff",
      "text-background-opacity": 0.95,
    },
  },
  // --- Mechanism nodes ---
  {
    selector: 'node[type="mechanism"]',
    style: {
      "background-color": "#f97316",
      "background-opacity": 0.85,
      "border-color": "#ea580c",
      shape: "diamond",
    },
  },
  // --- Method nodes ---
  {
    selector: 'node[type="method"]',
    style: {
      "background-color": "#16a34a",
      "background-opacity": 0.85,
      "border-color": "#15803d",
      shape: "round-rectangle",
    },
  },
  // --- Dataset nodes ---
  {
    selector: 'node[type="dataset"]',
    style: {
      "background-color": "#9333ea",
      "background-opacity": 0.85,
      "border-color": "#7e22ce",
      shape: "hexagon",
    },
  },
  // --- Puzzle nodes ---
  {
    selector: 'node[type="puzzle"]',
    style: {
      "background-color": "#dc2626",
      "background-opacity": 0.85,
      "border-color": "#b91c1c",
      shape: "triangle",
    },
  },
  // --- Edges ---
  {
    selector: "edge",
    style: {
      width: "mapData(weight, 1, 5, 2, 5)",
      "line-color": "#94a3b8",
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
      "shadow-blur": 10,
      "shadow-color": "#2563eb",
      "shadow-opacity": 0.25,
    },
  },
  // --- Selected node ---
  {
    selector: "node:selected",
    style: {
      "border-width": 4,
      "border-color": "#1d4ed8",
      "shadow-blur": 15,
      "shadow-color": "#3b82f6",
      "shadow-opacity": 0.6,
      "shadow-offset-x": 0,
      "shadow-offset-y": 0,
      "overlay-color": "#3b82f6",
      "overlay-opacity": 0.12,
      "font-size": "22px",
      "font-weight": "800",
      "text-background-opacity": 1,
    },
  },
  // --- Highlighted edges (connected to selected) ---
  {
    selector: "edge.highlighted",
    style: {
      "line-color": "#3b82f6",
      width: 2.5,
      opacity: 0.9,
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
];

// ---------------------------------------------------------------------------
// Layout configs — MUCH more spacing than before
// ---------------------------------------------------------------------------

function getLayoutConfig(name: LayoutName, nodeCount: number): LayoutOptions {
  // Scale spacing dramatically based on node count
  const isLarge = nodeCount > 60;
  const isMedium = nodeCount > 25;

  switch (name) {
    case "cose":
      return {
        name: "cose",
        animate: true,
        animationDuration: 600,
        // MUCH higher repulsion for proper spacing
        nodeRepulsion: () => (isLarge ? 250000 : isMedium ? 200000 : 150000),
        idealEdgeLength: () => (isLarge ? 500 : isMedium ? 420 : 350),
        edgeElasticity: () => 60,
        gravity: isLarge ? 0.02 : isMedium ? 0.04 : 0.06,
        nestingFactor: 1.2,
        numIter: 1500,
        padding: 120,
        randomize: false,
        fit: true,
        nodeDimensionsIncludeLabels: true, // KEY: account for label size in layout
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
  isSeed?: boolean;
  position: { x: number; y: number };
}

export function CytoscapeGraph({
  nodes,
  edges,
  layout,
  visibleTypes,
  onNodeSelect,
  onNodeExpand,
}: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const prevKeyRef = useRef<string>("");
  const [hoverNode, setHoverNode] = useState<HoverNodeState | null>(null);

  // Build elements from props
  const buildElements = useCallback(() => {
    const filteredNodes = nodes.filter((n) => visibleTypes.has(n.type));
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );

    return [
      ...filteredNodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          shortLabel: truncateLabel(node.label),
          type: node.type,
          size: node.size ?? (node.type === "paper" ? 3 : 1),
          displaySize: computeDisplaySize(node),
          borderColor: NODE_BORDER[node.type] ?? "#6b7280",
          year: node.year ?? null,
          fields: node.fields ?? [],
          theme: node.theme ?? null,
          paperCount: node.paperCount ?? null,
          isSeed: node.isSeed ? 1 : 0,
        },
      })),
      ...filteredEdges.map((edge) => ({
        data: {
          id: `${edge.source}-${edge.target}-${edge.relation}`,
          source: edge.source,
          target: edge.target,
          relation: edge.relation,
          weight: edge.weight ?? 1,
        },
      })),
    ];
  }, [nodes, edges, visibleTypes]);

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
          isSeed: Boolean(node.data("isSeed")),
        };
        cy.elements().removeClass("highlighted dimmed");
        const connEdges = node.connectedEdges();
        const connNodes = connEdges.connectedNodes();
        cy.elements().addClass("dimmed");
        node.removeClass("dimmed");
        connNodes.removeClass("dimmed");
        connEdges.removeClass("dimmed").addClass("highlighted");
        onNodeSelect(nodeData);
      });

      // Click background: deselect
      cy.on("tap", (evt) => {
        if (evt.target === cy) {
          cy.elements().removeClass("highlighted dimmed");
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
        wheelSensitivity: 0.3,
      });

      const nodeCount = elements.filter((e) => !("source" in e.data)).length;
      const layoutConfig = getLayoutConfig(layout, nodeCount);
      const layoutInstance = cy.layout(layoutConfig);
      layoutInstance.run();
      layoutInstance.on("layoutstop", () => cy.fit(undefined, 60));

      attachEvents(cy);
      cyRef.current = cy;
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, layout, visibleTypes]);

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
        cyRef.current.fit(undefined, 60);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleFit = useCallback(() => cyRef.current?.fit(undefined, 60), []);
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
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white/90 text-gray-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-gray-50 hover:text-gray-700"
          title="Fit to view"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4" />
          </svg>
        </button>
        <button
          onClick={handleZoomIn}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white/90 text-lg font-medium text-gray-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-gray-50 hover:text-gray-700"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white/90 text-lg font-medium text-gray-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-gray-50 hover:text-gray-700"
          title="Zoom out"
        >
          −
        </button>
      </div>

      {/* Legend — bottom-left */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white/90 px-3 py-2 text-sm font-medium text-gray-500 shadow-sm backdrop-blur-sm">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5 capitalize">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}
