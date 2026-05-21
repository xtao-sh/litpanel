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
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function levelColor(level: string) {
  if (level === "high") return "border-[var(--forest)] bg-[var(--forest-soft)] text-[var(--forest-2)]";
  if (level === "moderate") return "border-[#d6b678] bg-[#f4ead8] text-[#654814]";
  return "border-[var(--line-soft)] bg-[var(--paper-2)]/60 text-[var(--ink-4)]";
}

function statColor(level: string) {
  if (level === "high") return "bg-[var(--forest-soft)] border-[var(--forest)] text-[var(--forest-2)]";
  if (level === "moderate") return "bg-[#f4ead8] border-[#d6b678] text-[#7a5a18]";
  return "bg-[var(--paper-2)]/45 border-[var(--line-soft)] text-[var(--ink-4)]";
}

// scrollToSection is now defined inside ChinaDashboardPage to access state setters

// ---------------------------------------------------------------------------
// Paper row
// ---------------------------------------------------------------------------

function ChinaPaperRow({ paper }: { paper: ChinaPaper }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[var(--line-soft)] py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/paper/${paper.paperId}`}
            className="text-sm font-medium text-[var(--ink)] transition-colors hover:text-[var(--forest)]"
          >
            {paper.title || paper.paperId}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--ink-4)] font-mono">{paper.paperId}</span>
            {paper.year && <span className="text-xs text-[var(--ink-4)]">{paper.year}</span>}
            {paper.fields.slice(0, 3).map((f) => (
              <Badge key={f} variant="outline" className="text-[10px] py-0" title={f}>
                {f}
              </Badge>
            ))}
            {paper.averageScore !== null && (
              <span className="text-xs text-[var(--ink-4)]">
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
        <p className="mt-2 text-xs text-[var(--ink-4)] leading-relaxed">
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
      <span className="w-40 text-xs text-[var(--ink-4)] truncate shrink-0" title={stat.field}>
        {stat.field}
      </span>
      <div className="flex-1 flex h-5 rounded overflow-hidden bg-[var(--paper-2)]">
        {highPct > 0 && (
          <div
            className="bg-[var(--forest)] transition-all"
            style={{ width: `${highPct}%` }}
            title={`High: ${stat.highCount}`}
          />
        )}
        {modPct > 0 && (
          <div
            className="bg-[#d6b678] transition-all"
            style={{ width: `${modPct}%` }}
            title={`Moderate: ${stat.moderateCount}`}
          />
        )}
      </div>
      <span className="text-xs text-[var(--ink-4)] w-8 text-right shrink-0">{total}</span>
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
        className="flex cursor-pointer items-center gap-2 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-left transition-colors hover:bg-[var(--paper-2)]"
      >
        <span className="text-sm font-medium text-[var(--ink-4)]">{dm.field}</span>
        <Badge variant="secondary" className="text-xs">
          {dm.count} paper{dm.count !== 1 ? "s" : ""}
        </Badge>
        {dm.paperIds.length > 0 && (
          <ChevronDown className={`h-3 w-3 text-[var(--ink-4)] transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>
      {expanded && dm.paperIds.length > 0 && (
        <div className="mt-1 ml-2 space-y-1 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] p-2">
          {dm.paperIds.map((pid) => {
            const title = titleMap.get(pid);
            return (
              <Link
                key={pid}
                href={`/paper/${pid}`}
                className="flex items-center gap-1.5 rounded-[var(--r)] px-2 py-1 text-xs transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--forest)]"
              >
                <span className="flex-1 min-w-0">
                  {title ? (
                    <>
                      <span className="font-medium text-[var(--forest)]">&ldquo;{title}&rdquo;</span>
                      <span className="ml-1.5 text-[var(--ink-4)] font-mono text-[10px]">{pid}</span>
                    </>
                  ) : (
                    <span className="font-mono text-[var(--forest)]">{pid}</span>
                  )}
                </span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0 text-[var(--ink-4)]" />
              </Link>
            );
          })}
          <Link
            href={`/explorer?search=${encodeURIComponent(dm.field)}`}
            className="flex items-center gap-1.5 rounded-[var(--r)] px-2 py-1 text-xs text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--forest)]"
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
          <Skeleton key={i} className="h-24 rounded-[var(--r-md)]" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Skeleton className="h-96 rounded-[var(--r-md)]" />
        <Skeleton className="h-96 rounded-[var(--r-md)]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChinaDashboardPage() {
  const { t } = useI18n();
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
      ? "ring-2 ring-[#2c4870] animate-[ring-pulse_1s_ease-in-out]"
      : "";

  return (
    <div className="space-y-6">
      {/* Keyframes for the highlight ring-pulse animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ring-pulse {
          0% { box-shadow: 0 0 0 0 rgba(21, 128, 61, 0.38); }
          50% { box-shadow: 0 0 0 6px rgba(21, 128, 61, 0.18); }
          100% { box-shadow: 0 0 0 0 rgba(21, 128, 61, 0); }
        }
      ` }} />
      {/* Header */}
      <div className="lp-card grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper-2)] text-[var(--forest)]">
              <Globe className="h-5 w-5" />
            </div>
            <p className="section-kicker">Applicability Lens</p>
          </div>
          <div>
            <h2 className="font-display text-4xl tracking-tight text-[var(--ink)] sm:text-5xl">
              China Research Opportunities
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-4)] sm:text-[15px]">
              Papers applicable to the Chinese context, organized by transferability
              and supporting evidence.
            </p>
          </div>
        </div>
        <div className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] p-4">
          <p className="section-kicker">{t("common.pageInfo")}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-3)]">
            Start here when you want to separate directly portable findings from
            ideas that require local adaptation.
          </p>
        </div>
      </div>
      <div className="lp-card flex flex-wrap gap-2 px-5 py-4">
        <p className="section-kicker w-full">Jump To</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
            <Link href="/explorer?field=Health+Economics">
              <Compass className="h-3.5 w-3.5" />
              Browse in Explorer
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
            <Link href="/research?q=China">
              <Search className="h-3.5 w-3.5" />
              Research China-applicable Topics
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
            <Link href="/ideas">
              <Lightbulb className="h-3.5 w-3.5" />
              View Research Ideas
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="lp-card border-[#da9a80]/80 bg-[#f4dfd5]/80 p-4 shadow-none">
          <p className="text-sm text-[#8a3318]">
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
              className={`${statColor("high")} border cursor-pointer transition-shadow hover:shadow-[var(--shadow-2)] hover:ring-1 hover:ring-[var(--forest)]`}
              onClick={() => scrollToSection("high-papers")}
            >
              <CardContent className="p-5">
                <p className="text-3xl font-bold">{dashboard.totalHigh}</p>
                <p className="text-sm font-medium mt-1">Highly Applicable</p>
                <p className="text-xs opacity-70 mt-0.5">
                  Directly transferable methods or findings
                </p>
                {dashboard.highPapers.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-[var(--forest)]/50 pt-2">
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
              className={`${statColor("moderate")} border cursor-pointer transition-shadow hover:shadow-[var(--shadow-2)] hover:ring-1 hover:ring-[#b88a3b]`}
              onClick={() => scrollToSection("moderate-papers")}
            >
              <CardContent className="p-5">
                <p className="text-3xl font-bold">{dashboard.totalModerate}</p>
                <p className="text-sm font-medium mt-1">Moderately Applicable</p>
                <p className="text-xs opacity-70 mt-0.5">
                  Adaptable with modifications
                </p>
                {dashboard.moderatePapers.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-[#d6b678]/50 pt-2">
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
              className={`${statColor("low")} border cursor-pointer transition-shadow hover:shadow-[var(--shadow-2)] hover:ring-1 hover:ring-[var(--line)]`}
              onClick={() => scrollToSection("low-papers")}
            >
              <CardContent className="p-5">
                <p className="text-3xl font-bold">{dashboard.totalLow}</p>
                <p className="text-sm font-medium mt-1">Limited Applicability</p>
                <p className="text-xs opacity-70 mt-0.5">
                  Context-specific or difficult to transfer
                </p>
                {dashboard.lowPapers.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-[var(--line-soft)]/50 pt-2">
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
                  <h3 className="text-base font-semibold text-[var(--ink)]">
                    Highly Applicable Papers
                  </h3>
                  <Badge className={levelColor("high")}>{dashboard.highPapers.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="max-h-[500px] overflow-y-auto">
                {dashboard.highPapers.length === 0 ? (
                  <p className="text-sm text-[var(--ink-4)]">No highly applicable papers found.</p>
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
                <h3 className="text-base font-semibold text-[var(--ink)]">
                  Field Distribution
                </h3>
                <div className="flex items-center gap-4 mt-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-sm bg-[var(--forest)]" />
                    <span className="text-xs text-[var(--ink-4)]">High</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-sm bg-[#d6b678]" />
                    <span className="text-xs text-[var(--ink-4)]">Moderate</span>
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
                  <Database className="h-4 w-4 text-[var(--ink-4)]" />
                  <h3 className="text-base font-semibold text-[var(--ink)]">
                    Chinese Data Sources Mentioned
                  </h3>
                </div>
                <p className="text-xs text-[var(--ink-4)] mt-1">
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
                  <h3 className="text-base font-semibold text-[var(--ink)]">
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
                  <h3 className="text-base font-semibold text-[var(--ink)]">
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
                  <p className="text-sm text-[var(--ink-4)]">No limited applicability papers found.</p>
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
