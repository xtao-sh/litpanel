"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@apollo/client/react";

import { GET_METHOD_FIELD_MATRIX } from "@/lib/queries";
import type { MethodFieldMatrix } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, BarChart3 } from "lucide-react";

// ---------------------------------------------------------------------------
// Color scale: paper -> sky gradient
// ---------------------------------------------------------------------------

function heatColor(value: number, maxValue: number): string {
  if (maxValue === 0 || value === 0) return "bg-background";
  const ratio = value / maxValue;
  if (ratio > 0.75) return "bg-sky-600";
  if (ratio > 0.5) return "bg-sky-500";
  if (ratio > 0.3) return "bg-sky-400";
  if (ratio > 0.15) return "bg-sky-200";
  if (ratio > 0.05) return "bg-sky-100";
  return "bg-[color:oklch(var(--accent)/0.45)]";
}

function heatTextColor(value: number, maxValue: number): string {
  if (maxValue === 0 || value === 0) return "text-muted-foreground/40";
  const ratio = value / maxValue;
  if (ratio > 0.5) return "text-white";
  if (ratio > 0.15) return "text-sky-900";
  return "text-sky-700";
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function truncateLabel(label: string, maxLen: number = 20): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + "\u2026";
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Legend({ maxValue }: { maxValue: number }) {
  const stops = [
    { label: "0", cls: "bg-background border border-border/70" },
    { label: "", cls: "bg-[color:oklch(var(--accent)/0.45)]" },
    { label: "", cls: "bg-sky-100" },
    { label: "", cls: "bg-sky-200" },
    { label: "", cls: "bg-sky-400" },
    { label: "", cls: "bg-sky-500" },
    { label: String(maxValue), cls: "bg-sky-600" },
  ];

  return (
    <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
      <span>Low</span>
      {stops.map((s, i) => (
        <div key={i} className={`h-3 w-4 rounded-sm ${s.cls}`} />
      ))}
      <span>High</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function HeatmapSkeleton() {
  return (
    <Card className="paper-panel rounded-[1.5rem] border-border/75 shadow-none">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-52" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-4 w-20" />
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                  <Skeleton key={j} className="h-7 w-10" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

interface TooltipState {
  method: string;
  field: string;
  count: number;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MethodFieldHeatmap() {
  const { data, loading, error } = useQuery<{
    methodFieldMatrix: MethodFieldMatrix;
  }>(GET_METHOD_FIELD_MATRIX, {
    variables: { topMethods: 15, topFields: 10 },
  });

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const maxValue = useMemo(() => {
    if (!data?.methodFieldMatrix?.matrix) return 0;
    let max = 0;
    for (const row of data.methodFieldMatrix.matrix) {
      for (const val of row) {
        if (val > max) max = val;
      }
    }
    return max;
  }, [data]);

  if (loading) return <HeatmapSkeleton />;

  if (error) {
    return (
      <Card className="paper-panel rounded-[1.5rem] border-border/75 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Method x Field Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load the heatmap. Please refresh the page.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.methodFieldMatrix) {
    return (
      <Card className="paper-panel rounded-[1.5rem] border-border/75 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" /> Method x Field Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No method-field data available yet. Run the pipeline to populate.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { methods, fields, matrix } = data.methodFieldMatrix;

  if (methods.length === 0 || fields.length === 0) {
    return (
      <Card className="paper-panel rounded-[1.5rem] border-border/75 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" /> Method x Field Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No method-field data available yet. Run the pipeline to populate.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="paper-panel rounded-[1.5rem] border-border/75 shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="section-kicker">Coverage map</p>
            <h3 className="mt-2 font-display text-[1.4rem] text-foreground">
              Method x Field Distribution
            </h3>
          </div>
          <Legend maxValue={maxValue} />
        </div>
        <p className="text-xs text-muted-foreground">
          Co-occurrence of methods and research fields across triaged papers
        </p>
      </CardHeader>
      <CardContent className="relative pb-4">
        {/* Mobile simplified view */}
        <div className="md:hidden space-y-2">
          <p className="text-xs text-muted-foreground">Top methods by paper count</p>
          {methods.slice(0, 5).map((method, mi) => {
            const rowTotal = (matrix[mi] ?? []).reduce((sum: number, v: number) => sum + v, 0);
            return (
              <div key={method} className="flex items-center gap-2 text-sm">
                <span className="font-medium truncate flex-1">{method}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{rowTotal} papers</span>
              </div>
            );
          })}
        </div>

        {/* Full heatmap for md+ screens */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            {/* Grid container */}
            <div className="inline-block min-w-fit">
              {/* Column headers */}
              <div
                className="grid gap-px"
                style={{
                  gridTemplateColumns: `8rem repeat(${fields.length}, minmax(6rem, 1fr))`,
                }}
              >
                {/* Empty corner cell */}
                <div />
                {/* Field labels */}
                {fields.map((field) => (
                  <div
                    key={field}
                    className="flex items-end justify-center pb-1 text-center"
                    title={field}
                  >
                    <span className="whitespace-normal text-center text-[13px] font-semibold leading-tight text-muted-foreground">
                      {truncateLabel(field, 24)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Data rows */}
              {methods.map((method, mi) => (
                <div
                  key={method}
                  className="grid gap-px"
                  style={{
                    gridTemplateColumns: `8rem repeat(${fields.length}, minmax(6rem, 1fr))`,
                  }}
                >
                  {/* Method label */}
                  <div
                    className="flex items-center pr-2"
                    title={method}
                  >
                    <span className="truncate text-[14px] font-semibold text-muted-foreground">
                      {truncateLabel(method)}
                    </span>
                  </div>
                  {/* Cells */}
                  {fields.map((field, fi) => {
                    const count = matrix[mi]?.[fi] ?? 0;
                    return (
                      <div
                        key={`${method}-${field}`}
                        className={`flex h-10 cursor-default items-center justify-center rounded-sm transition-opacity hover:opacity-80 ${heatColor(count, maxValue)} ${heatTextColor(count, maxValue)}`}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltip({
                            method,
                            field,
                            count,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <span className="text-[13px] font-semibold">
                          {count > 0 ? count : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Floating tooltip */}
          {tooltip && (
            <div
              className="paper-panel pointer-events-none fixed z-50 rounded-[1rem] border border-border/75 bg-background/95 px-3 py-2 shadow-[0_18px_44px_rgba(44,51,71,0.16)]"
              style={{
                left: `${tooltip.x}px`,
                top: `${tooltip.y - 8}px`,
                transform: "translate(-50%, -100%)",
              }}
            >
              <p className="text-xs font-semibold text-foreground">
                {tooltip.count} paper{tooltip.count !== 1 ? "s" : ""}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {tooltip.method} &times; {tooltip.field}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
