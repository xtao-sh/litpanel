"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { ChevronDown, ChevronUp, Database, Globe, Compass, Search, Lightbulb, ExternalLink } from "lucide-react";

import { GET_CHINA_DASHBOARD } from "@/lib/queries";
import type { ChinaDashboard, ChinaPaper, ChinaFieldStat, PaperIdTitle } from "@/lib/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function levelColor(level: string) {
  if (level === "high") return "bg-green-100 text-green-800 border-green-200";
  if (level === "moderate") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function statColor(level: string) {
  if (level === "high") return "bg-green-50 border-green-200 text-green-700";
  if (level === "moderate") return "bg-yellow-50 border-yellow-200 text-yellow-700";
  return "bg-gray-50 border-gray-200 text-gray-500";
}

// scrollToSection is now defined inside ChinaDashboardPage to access state setters

// ---------------------------------------------------------------------------
// Paper row
// ---------------------------------------------------------------------------

function ChinaPaperRow({ paper }: { paper: ChinaPaper }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-100 py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/paper/${paper.paperId}`}
            className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors"
          >
            {paper.title || paper.paperId}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">{paper.paperId}</span>
            {paper.year && <span className="text-xs text-gray-400">{paper.year}</span>}
            {paper.fields.slice(0, 3).map((f) => (
              <Badge key={f} variant="outline" className="text-[10px] py-0">
                {f}
              </Badge>
            ))}
            {paper.averageScore !== null && (
              <span className="text-xs text-gray-500">
                Score: {paper.averageScore.toFixed(1)}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>
      {expanded && (
        <p className="mt-2 text-xs text-gray-600 leading-relaxed">
          {paper.applicabilitySummary}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart row
// ---------------------------------------------------------------------------

function FieldBar({ stat, maxTotal }: { stat: ChinaFieldStat; maxTotal: number }) {
  const total = stat.highCount + stat.moderateCount;
  const highPct = maxTotal > 0 ? (stat.highCount / maxTotal) * 100 : 0;
  const modPct = maxTotal > 0 ? (stat.moderateCount / maxTotal) * 100 : 0;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-40 text-xs text-gray-600 truncate shrink-0" title={stat.field}>
        {stat.field}
      </span>
      <div className="flex-1 flex h-5 rounded overflow-hidden bg-gray-100">
        {highPct > 0 && (
          <div
            className="bg-green-400 transition-all"
            style={{ width: `${highPct}%` }}
            title={`High: ${stat.highCount}`}
          />
        )}
        {modPct > 0 && (
          <div
            className="bg-yellow-300 transition-all"
            style={{ width: `${modPct}%` }}
            title={`Moderate: ${stat.moderateCount}`}
          />
        )}
      </div>
      <span className="text-xs text-gray-400 w-8 text-right shrink-0">{total}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive data source chip
// ---------------------------------------------------------------------------

function DataSourceChip({
  dm,
}: {
  dm: { field: string; count: number; paperIds: string[]; paperTitles: PaperIdTitle[] };
}) {
  const [expanded, setExpanded] = useState(false);

  // Build a lookup map from paperId -> title for quick access
  const titleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    dm.paperTitles?.forEach((pt) => map.set(pt.paperId, pt.title));
    return map;
  }, [dm.paperTitles]);

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 transition-colors hover:bg-blue-50 hover:border-blue-200 cursor-pointer text-left"
      >
        <span className="text-sm font-medium text-gray-700">{dm.field}</span>
        <Badge variant="secondary" className="text-xs">
          {dm.count} paper{dm.count !== 1 ? "s" : ""}
        </Badge>
        {dm.paperIds.length > 0 && (
          <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>
      {expanded && dm.paperIds.length > 0 && (
        <div className="mt-1 ml-2 rounded-lg border border-gray-100 bg-white p-2 space-y-1">
          {dm.paperIds.map((pid) => {
            const title = titleMap.get(pid);
            return (
              <Link
                key={pid}
                href={`/paper/${pid}`}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                <span className="flex-1 min-w-0">
                  {title ? (
                    <>
                      <span className="text-blue-600 font-medium">&ldquo;{title}&rdquo;</span>
                      <span className="ml-1.5 text-gray-400 font-mono text-[10px]">{pid}</span>
                    </>
                  ) : (
                    <span className="text-blue-600 font-mono">{pid}</span>
                  )}
                </span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0 text-gray-400" />
              </Link>
            );
          })}
          <Link
            href={`/explorer?search=${encodeURIComponent(dm.field)}`}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Search className="h-2.5 w-2.5" />
            Search in Explorer
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChinaDashboardPage() {
  const { data, loading, error } = useQuery<{ chinaDashboard: ChinaDashboard }>(
    GET_CHINA_DASHBOARD
  );
  const [showModerate, setShowModerate] = useState(false);
  const [showLow, setShowLow] = useState(false);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dashboard = data?.chinaDashboard;

  const maxFieldTotal = dashboard
    ? Math.max(...dashboard.fieldDistribution.map((f) => f.highCount + f.moderateCount), 1)
    : 1;

  // Cleanup highlight timer on unmount
  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  const scrollToSection = useCallback(
    (id: string) => {
      // Auto-expand the section if needed
      if (id === "moderate-papers") setShowModerate(true);
      if (id === "low-papers") setShowLow(true);

      // Set highlight
      setHighlightedSection(id);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightedSection(null), 2000);

      // Wait a tick for expansion to render, then scroll
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    },
    [setShowModerate, setShowLow]
  );

  /** CSS class for the ring-pulse highlight animation */
  const highlightClass = (id: string) =>
    highlightedSection === id
      ? "ring-2 ring-blue-400 animate-[ring-pulse_1s_ease-in-out]"
      : "";

  return (
    <div className="space-y-6">
      {/* Keyframes for the highlight ring-pulse animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ring-pulse {
          0% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.5); }
          50% { box-shadow: 0 0 0 6px rgba(96, 165, 250, 0.25); }
          100% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0); }
        }
      ` }} />
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Globe className="h-6 w-6 text-red-600" />
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            China Research Opportunities
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Papers applicable to the Chinese context, organized by relevance level
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/explorer?field=Health+Economics">
              <Compass className="h-3.5 w-3.5" />
              Browse in Explorer
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/research?q=China">
              <Search className="h-3.5 w-3.5" />
              Research China-applicable Topics
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/ideas">
              <Lightbulb className="h-3.5 w-3.5" />
              View Research Ideas
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            Failed to load China dashboard. Please try again later.
          </p>
        </div>
      )}

      {loading && <DashboardSkeleton />}

      {dashboard && (
        <>
          {/* Row 1: Summary stats -- clickable to scroll to sections */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card
              className={`${statColor("high")} border cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-green-300`}
              onClick={() => scrollToSection("high-papers")}
            >
              <CardContent className="p-5">
                <p className="text-3xl font-bold">{dashboard.totalHigh}</p>
                <p className="text-sm font-medium mt-1">Highly Applicable</p>
                <p className="text-xs opacity-70 mt-0.5">
                  Directly transferable methods or findings
                </p>
                {dashboard.highPapers.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-green-200/50 pt-2">
                    {dashboard.highPapers.slice(0, 3).map((p) => (
                      <p key={p.paperId} className="text-xs truncate opacity-80" title={p.title || p.paperId}>
                        {p.title || p.paperId}
                      </p>
                    ))}
                    {dashboard.highPapers.length > 3 && (
                      <p className="text-xs opacity-50">+{dashboard.highPapers.length - 3} more</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card
              className={`${statColor("moderate")} border cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-yellow-300`}
              onClick={() => scrollToSection("moderate-papers")}
            >
              <CardContent className="p-5">
                <p className="text-3xl font-bold">{dashboard.totalModerate}</p>
                <p className="text-sm font-medium mt-1">Moderately Applicable</p>
                <p className="text-xs opacity-70 mt-0.5">
                  Adaptable with modifications
                </p>
                {dashboard.moderatePapers.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-yellow-200/50 pt-2">
                    {dashboard.moderatePapers.slice(0, 3).map((p) => (
                      <p key={p.paperId} className="text-xs truncate opacity-80" title={p.title || p.paperId}>
                        {p.title || p.paperId}
                      </p>
                    ))}
                    {dashboard.moderatePapers.length > 3 && (
                      <p className="text-xs opacity-50">+{dashboard.moderatePapers.length - 3} more</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card
              className={`${statColor("low")} border cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-gray-300`}
              onClick={() => scrollToSection("low-papers")}
            >
              <CardContent className="p-5">
                <p className="text-3xl font-bold">{dashboard.totalLow}</p>
                <p className="text-sm font-medium mt-1">Limited Applicability</p>
                <p className="text-xs opacity-70 mt-0.5">
                  Context-specific or difficult to transfer
                </p>
                {dashboard.lowPapers.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-gray-200/50 pt-2">
                    {dashboard.lowPapers.slice(0, 3).map((p) => (
                      <p key={p.paperId} className="text-xs truncate opacity-80" title={p.title || p.paperId}>
                        {p.title || p.paperId}
                      </p>
                    ))}
                    {dashboard.lowPapers.length > 3 && (
                      <p className="text-xs opacity-50">+{dashboard.lowPapers.length - 3} more</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Two columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: High applicability papers */}
            <Card id="high-papers" className={`scroll-mt-24 transition-all duration-500 ${highlightClass("high-papers")}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">
                    Highly Applicable Papers
                  </h3>
                  <Badge className={levelColor("high")}>{dashboard.highPapers.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="max-h-[500px] overflow-y-auto">
                {dashboard.highPapers.length === 0 ? (
                  <p className="text-sm text-gray-400">No highly applicable papers found.</p>
                ) : (
                  dashboard.highPapers.map((p) => (
                    <ChinaPaperRow key={p.paperId} paper={p} />
                  ))
                )}
              </CardContent>
            </Card>

            {/* Right: Field Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <h3 className="text-base font-semibold text-gray-900">
                  Field Distribution
                </h3>
                <div className="flex items-center gap-4 mt-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-sm bg-green-400" />
                    <span className="text-xs text-gray-500">High</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-sm bg-yellow-300" />
                    <span className="text-xs text-gray-500">Moderate</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="max-h-[500px] overflow-y-auto">
                {dashboard.fieldDistribution.map((stat) => (
                  <FieldBar key={stat.field} stat={stat} maxTotal={maxFieldTotal} />
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Chinese Data Sources -- now interactive */}
          {dashboard.dataMentions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-gray-500" />
                  <h3 className="text-base font-semibold text-gray-900">
                    Chinese Data Sources Mentioned
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Click a data source to see which papers mention it
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {dashboard.dataMentions.map((dm) => (
                    <DataSourceChip key={dm.field} dm={dm} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Row 4: Moderate Applicability Papers (expandable) */}
          <Card id="moderate-papers" className={`scroll-mt-24 transition-all duration-500 ${highlightClass("moderate-papers")}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-900">
                    Moderately Applicable Papers
                  </h3>
                  <Badge className={levelColor("moderate")}>{dashboard.moderatePapers.length}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowModerate(!showModerate)}
                  className="text-xs"
                >
                  {showModerate ? (
                    <>
                      Collapse <ChevronUp className="ml-1 h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Expand <ChevronDown className="ml-1 h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {showModerate && (
              <CardContent className="max-h-[500px] overflow-y-auto">
                {dashboard.moderatePapers.map((p) => (
                  <ChinaPaperRow key={p.paperId} paper={p} />
                ))}
              </CardContent>
            )}
          </Card>

          {/* Row 5: Low Applicability Papers (expandable) */}
          <Card id="low-papers" className={`scroll-mt-24 transition-all duration-500 ${highlightClass("low-papers")}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-900">
                    Limited Applicability Papers
                  </h3>
                  <Badge className={levelColor("low")}>{dashboard.lowPapers.length}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLow(!showLow)}
                  className="text-xs"
                >
                  {showLow ? (
                    <>
                      Collapse <ChevronUp className="ml-1 h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Expand <ChevronDown className="ml-1 h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {showLow && (
              <CardContent className="max-h-[500px] overflow-y-auto">
                {dashboard.lowPapers.length === 0 ? (
                  <p className="text-sm text-gray-400">No limited applicability papers found.</p>
                ) : (
                  dashboard.lowPapers.map((p) => (
                    <ChinaPaperRow key={p.paperId} paper={p} />
                  ))
                )}
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
