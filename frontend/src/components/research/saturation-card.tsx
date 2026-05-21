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
      return "bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]";
    case "growing":
      return "bg-[#e9eef6] text-[#223a5e] border-[#bccbe0]";
    case "mature":
      return "bg-[#f4ead8] text-[#7a5a18] border-[#d6b678]";
    case "saturated":
      return "bg-[#f4dfd5] text-[#8a3318] border-[#da9a80]";
    default:
      return "bg-[var(--paper-2)] text-[var(--ink-3)] border-[var(--line-soft)]";
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
              className="fill-[#2c4870]"
            />
            {/* Show year label for first, last, and every ~5th bar */}
            {(i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 5) === 0) && (
              <text
                x={i * (barWidth + 2) + barWidth / 2}
                y={chartHeight + 11}
                textAnchor="middle"
                className="fill-[var(--ink-5)]"
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
      <Card className="border-[var(--line-soft)] shadow-[var(--shadow-1)]">
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
    <Card className="border-[var(--line-soft)] shadow-[var(--shadow-1)]">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-3)]">
            <TrendingUp className="h-4 w-4 text-[#2c4870]" />
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
            <p className="mb-1.5 text-[11px] font-medium text-[var(--ink-4)]">
              {t("latest.saturation.papersPerYear", { count: saturation.totalPapers })}
            </p>
            <MiniBarChart data={saturation.yearTrend} />
          </div>
        )}

        {/* Growth rate + method diversity row */}
        <div className="flex gap-4">
          <div className="flex-1 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper-2)] p-2.5">
            <p className="text-[10px] font-medium text-[var(--ink-4)] uppercase tracking-wider">
              {t("latest.saturation.growthRate")}
            </p>
            <p
              className={`text-lg font-bold tabular-nums ${
                growthPct > 0
                  ? "text-[var(--forest)]"
                  : growthPct < 0
                  ? "text-[#8a3318]"
                  : "text-[var(--ink-3)]"
              }`}
            >
              {growthSign}
              {growthPct.toFixed(1)}%
            </p>
          </div>
          <div className="flex-1 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper-2)] p-2.5">
            <p className="text-[10px] font-medium text-[var(--ink-4)] uppercase tracking-wider">
              {t("latest.saturation.methodDiversity")}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-[var(--paper-3)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#2c4870] transition-all"
                  style={{ width: `${diversityPct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-[var(--ink-3)] tabular-nums">
                {diversityPct}%
              </span>
            </div>
          </div>
        </div>

        {/* Key indicators */}
        {saturation.keyIndicators.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-[var(--ink-4)]">
              {t("latest.saturation.keyIndicators")}
            </p>
            {saturation.keyIndicators.map((ki: SaturationIndicator) => (
              <div
                key={ki.indicator}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-[var(--ink-3)] font-medium shrink-0">
                  {ki.indicator}
                </span>
                <span className="text-[var(--ink-5)] text-[10px] truncate flex-1 text-right">
                  {ki.interpretation}
                </span>
                <span className="font-semibold text-[var(--ink-2)] shrink-0 tabular-nums">
                  {ki.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Recommendation */}
        {saturation.recommendation && (
          <div className="rounded-[var(--r)] border border-[#dfe7f2] bg-[#e9eef6]/50 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-[#2c4870] mt-0.5 shrink-0" />
              <p className="text-xs text-[#223a5e] leading-relaxed">
                {saturation.recommendation}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
