"use client";

import React from "react";
import { useQuery } from "@apollo/client/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Info } from "lucide-react";
import { TOPIC_SATURATION } from "@/lib/queries";
import type { TopicSaturation, SaturationIndicator } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SaturationCardProps {
  searchQuery: string;
  allPaperIds: string[];
}

// ---------------------------------------------------------------------------
// Phase badge styling
// ---------------------------------------------------------------------------

function phaseBadge(phase: string) {
  switch (phase) {
    case "emerging":
      return "bg-green-100 text-green-700 border-green-200";
    case "growing":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "mature":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "saturated":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function phaseLabel(phase: string, t: (key: string) => string) {
  switch (phase) {
    case "emerging":
    case "growing":
    case "mature":
    case "saturated":
      return t(`latest.saturation.phases.${phase}`);
    default:
      return t("latest.saturation.phases.unknown");
  }
}

// ---------------------------------------------------------------------------
// Mini bar chart (SVG)
// ---------------------------------------------------------------------------

function MiniBarChart({
  data,
}: {
  data: { year: number; count: number }[];
}) {
  if (data.length === 0) return null;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const barWidth = Math.max(6, Math.min(16, Math.floor(240 / data.length) - 2));
  const chartWidth = data.length * (barWidth + 2);
  const chartHeight = 48;

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight + 14}`}
      className="w-full max-w-[280px]"
      preserveAspectRatio="xMidYMid meet"
    >
      {data.map((d, i) => {
        const barHeight = (d.count / maxCount) * chartHeight;
        return (
          <g key={d.year}>
            <rect
              x={i * (barWidth + 2)}
              y={chartHeight - barHeight}
              width={barWidth}
              height={barHeight}
              rx={1.5}
              className="fill-blue-400"
            />
            {/* Show year label for first, last, and every ~5th bar */}
            {(i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 5) === 0) && (
              <text
                x={i * (barWidth + 2) + barWidth / 2}
                y={chartHeight + 11}
                textAnchor="middle"
                className="fill-gray-400"
                fontSize="7"
              >
                {String(d.year).slice(-2)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SaturationCard({
  searchQuery,
  allPaperIds,
}: SaturationCardProps) {
  const { t } = useI18n();
  const { data, loading } = useQuery<{
    topicSaturation: TopicSaturation;
  }>(TOPIC_SATURATION, {
    variables: {
      query: searchQuery,
      paperIds: allPaperIds.length > 0 ? allPaperIds : null,
    },
    skip: !searchQuery,
  });

  if (loading) {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader className="p-4 pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-2 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  const saturation = data?.topicSaturation;
  if (!saturation || saturation.totalPapers === 0) return null;

  const growthPct = saturation.annualGrowthRate * 100;
  const growthSign = growthPct >= 0 ? "+" : "";
  const diversityPct = Math.round(saturation.methodDiversity * 100);

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            {t("latest.saturation.title")}
          </CardTitle>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${phaseBadge(
              saturation.growthPhase
            )}`}
          >
            {phaseLabel(saturation.growthPhase, t)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-2 space-y-4">
        {/* Year trend mini chart */}
        {saturation.yearTrend.length > 1 && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-gray-500">
              {t("latest.saturation.papersPerYear", { count: saturation.totalPapers })}
            </p>
            <MiniBarChart data={saturation.yearTrend} />
          </div>
        )}

        {/* Growth rate + method diversity row */}
        <div className="flex gap-4">
          <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50 p-2.5">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              {t("latest.saturation.growthRate")}
            </p>
            <p
              className={`text-lg font-bold tabular-nums ${
                growthPct > 0
                  ? "text-green-600"
                  : growthPct < 0
                  ? "text-red-600"
                  : "text-gray-600"
              }`}
            >
              {growthSign}
              {growthPct.toFixed(1)}%
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50 p-2.5">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              {t("latest.saturation.methodDiversity")}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${diversityPct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-600 tabular-nums">
                {diversityPct}%
              </span>
            </div>
          </div>
        </div>

        {/* Key indicators */}
        {saturation.keyIndicators.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-gray-500">
              {t("latest.saturation.keyIndicators")}
            </p>
            {saturation.keyIndicators.map((ki: SaturationIndicator) => (
              <div
                key={ki.indicator}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-gray-600 font-medium shrink-0">
                  {ki.indicator}
                </span>
                <span className="text-gray-400 text-[10px] truncate flex-1 text-right">
                  {ki.interpretation}
                </span>
                <span className="font-semibold text-gray-800 shrink-0 tabular-nums">
                  {ki.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Recommendation */}
        {saturation.recommendation && (
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 leading-relaxed">
                {saturation.recommendation}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
