"use client";

import React, { useState, useRef, useCallback } from "react";
import { useQuery } from "@apollo/client/react";
import Link from "next/link";
import { GET_FIELD_TAXONOMY, GET_FIELD_DETAIL } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  FlaskConical,
  Database,
  Cog,
  HelpCircle,
  ArrowUpDown,
  BarChart3,
  Tag,
  X,
  Filter,
  Hash,
  Sparkles,
} from "lucide-react";
import type {
  FieldTaxonomyItem,
  FieldTaxonomyAtom,
  FieldDetailData,
  Paper,
  JelCodeCount,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Year distribution mini-bar chart
// ---------------------------------------------------------------------------

function YearBars({
  data,
}: {
  data: { year: number; count: number }[];
}) {
  if (!data.length) return null;
  const minYear = Math.min(...data.map((d) => d.year));
  const maxYear = Math.max(...data.map((d) => d.year));
  const countsByYear = new Map(data.map((d) => [d.year, d.count]));
  const series = Array.from({ length: maxYear - minYear + 1 }, (_, index) => {
    const year = minYear + index;
    return {
      year,
      count: countsByYear.get(year) ?? 0,
    };
  });
  const maxCount = Math.max(...series.map((d) => d.count), 1);

  return (
    <div
      className="grid h-16 items-end gap-1"
      style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}
    >
      {series.map((d) => (
        <div
          key={d.year}
          className="group relative flex min-w-0 items-end"
        >
          <div
            className="w-full rounded-t bg-blue-400/70 hover:bg-blue-500 transition-colors"
            style={{ height: `${Math.max(Math.round((d.count / maxCount) * 56), 2)}px` }}
          />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded bg-gray-900 px-1.5 py-0.5 text-[10px] text-white z-10">
            {d.year}: {d.count}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Atom badge list (clickable, links to /atom/slug)
// ---------------------------------------------------------------------------

function AtomBadges({
  atoms,
  variant,
  limit = 8,
}: {
  atoms: FieldTaxonomyAtom[];
  variant: "method" | "mechanism" | "dataset" | "puzzle";
  limit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const display = showAll ? atoms : atoms.slice(0, limit);
  if (!atoms.length) return <span className="text-xs text-muted-foreground italic">None found</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {display.map((a) => (
        <Link key={a.slug} href={`/atom/${a.slug}`}>
          <Badge
            variant={variant}
            className="cursor-pointer hover:opacity-80 transition-opacity text-[11px]"
          >
            {a.title}
            <span className="ml-1 opacity-60">({a.paperCount})</span>
          </Badge>
        </Link>
      ))}
      {atoms.length > limit && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[11px] text-blue-600 hover:text-blue-700 font-medium px-1"
        >
          {showAll ? "Show fewer" : `+${atoms.length - limit} more`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Common Research Topics — groups atoms by theme with collapsible sections
// ---------------------------------------------------------------------------

/** Helper to build sorted theme groups from atom arrays. */
function buildThemeGroups(
  mechanisms: FieldTaxonomyAtom[],
  methods: FieldTaxonomyAtom[],
  datasets: FieldTaxonomyAtom[],
  puzzles: FieldTaxonomyAtom[],
) {
  const allAtoms = [
    ...mechanisms.map((a) => ({ ...a, atomType: "mechanism" as const })),
    ...methods.map((a) => ({ ...a, atomType: "method" as const })),
    ...datasets.map((a) => ({ ...a, atomType: "dataset" as const })),
    ...puzzles.map((a) => ({ ...a, atomType: "puzzle" as const })),
  ];

  const themeGroups: Record<
    string,
    { atoms: (FieldTaxonomyAtom & { atomType: string })[]; totalPaperRefs: number }
  > = {};

  for (const atom of allAtoms) {
    const theme = atom.theme || `Other ${atom.atomType.charAt(0).toUpperCase() + atom.atomType.slice(1)}s`;
    if (!themeGroups[theme]) {
      themeGroups[theme] = { atoms: [], totalPaperRefs: 0 };
    }
    themeGroups[theme].atoms.push(atom);
    themeGroups[theme].totalPaperRefs += atom.paperCount;
  }

  return Object.entries(themeGroups).sort((a, b) => {
    const aIsOther = a[0].startsWith("Other ");
    const bIsOther = b[0].startsWith("Other ");
    if (aIsOther !== bIsOther) return aIsOther ? 1 : -1;
    return b[1].totalPaperRefs - a[1].totalPaperRefs;
  });
}

function CommonTopics({
  mechanisms,
  methods,
  datasets,
  puzzles,
  expandedThemes,
  setExpandedThemes,
  themeRefs,
}: {
  mechanisms: FieldTaxonomyAtom[];
  methods: FieldTaxonomyAtom[];
  datasets: FieldTaxonomyAtom[];
  puzzles: FieldTaxonomyAtom[];
  expandedThemes: Set<string>;
  setExpandedThemes: React.Dispatch<React.SetStateAction<Set<string>>>;
  themeRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  const sortedThemes = buildThemeGroups(mechanisms, methods, datasets, puzzles);

  if (sortedThemes.length === 0) return null;

  const maxPaperRefs = Math.max(...sortedThemes.map(([, g]) => g.totalPaperRefs), 1);

  const toggleTheme = (theme: string) => {
    setExpandedThemes((prev) => {
      const next = new Set(prev);
      if (next.has(theme)) {
        next.delete(theme);
      } else {
        next.add(theme);
      }
      return next;
    });
  };

  const typeVariant = (t: string) =>
    t === "method" ? "method" : t === "mechanism" ? "mechanism" : t === "dataset" ? "dataset" : "puzzle";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Tag className="h-3.5 w-3.5" />
        Common Research Topics
      </div>
      <div className="rounded-lg border border-border bg-background divide-y divide-border">
        {sortedThemes.map(([theme, group]) => {
          const isExpanded = expandedThemes.has(theme);
          const barWidth = Math.max(Math.round((group.totalPaperRefs / maxPaperRefs) * 100), 4);
          return (
            <div
              key={theme}
              ref={(el) => { themeRefs.current[theme] = el; }}
            >
              <button
                onClick={() => toggleTheme(theme)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm font-medium text-foreground truncate">
                    {theme}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({group.atoms.length} {group.atoms.length === 1 ? "atom" : "atoms"})
                  </span>
                  <Badge variant="secondary" className="text-[10px] shrink-0 font-semibold">
                    {group.totalPaperRefs} papers
                  </Badge>
                  {/* Mini bar indicator */}
                  <div className="hidden sm:block h-1.5 flex-1 max-w-[80px] bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400/70 rounded-full"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isExpanded && (
                <div className="px-4 pb-3 pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {group.atoms
                      .sort((a, b) => b.paperCount - a.paperCount)
                      .map((atom) => (
                        <Link key={atom.slug} href={`/atom/${atom.slug}`}>
                          <Badge
                            variant={typeVariant(atom.atomType)}
                            className="cursor-pointer hover:opacity-80 transition-opacity text-[11px]"
                          >
                            {atom.title}
                            <span className="ml-1 opacity-60">({atom.paperCount})</span>
                          </Badge>
                        </Link>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left panel: field list
// ---------------------------------------------------------------------------

function FieldList({
  fields,
  selected,
  onSelect,
  loading,
}: {
  fields: FieldTaxonomyItem[];
  selected: string | null;
  onSelect: (f: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-0.5">
        {fields.map((f) => {
          const isActive = selected === f.field;
          return (
            <button
              key={f.field}
              onClick={() => onSelect(f.field)}
              className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-800 font-medium border-l-2 border-blue-500"
                  : "text-foreground/80 hover:bg-accent/60"
              }`}
            >
              <span className="truncate text-left">{f.field}</span>
              <span className={`ml-2 shrink-0 text-xs tabular-nums ${
                isActive ? "text-blue-600" : "text-muted-foreground"
              }`}>
                {f.paperCount.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Right panel: field detail
// ---------------------------------------------------------------------------

type SortKey = "YEAR_DESC" | "YEAR_ASC" | "SCORE_DESC" | "SCORE_ASC" | "JEL_ASC";

function FieldDetailPanel({
  field,
  taxonomyItem,
}: {
  field: string;
  taxonomyItem: FieldTaxonomyItem | undefined;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("YEAR_DESC");
  const [page, setPage] = useState(0);
  const [jelFilter, setJelFilter] = useState<string | null>(null);
  const [expandedJelPrefix, setExpandedJelPrefix] = useState<string | null>(null);
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const themeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pageSize = 25;

  const { data, loading, error } = useQuery<{ fieldDetail: FieldDetailData }>(
    GET_FIELD_DETAIL,
    {
      variables: {
        field,
        limit: pageSize,
        offset: page * pageSize,
        sort: sortKey,
        jelFilter: jelFilter ?? undefined,
      },
      fetchPolicy: "cache-and-network",
    }
  );

  const detail = data?.fieldDetail;

  // Use taxonomy data for quick badges while detail loads
  const methods = detail?.methods ?? taxonomyItem?.topMethods ?? [];
  const mechanisms = detail?.mechanisms ?? taxonomyItem?.topMechanisms ?? [];
  const datasets = detail?.datasets ?? taxonomyItem?.topDatasets ?? [];
  const puzzles = detail?.puzzles ?? [];
  const yearDist = detail?.yearDistribution ?? [];
  const jelCodes: JelCodeCount[] = detail?.jelCodes ?? [];
  const papers = detail?.papers?.items ?? [];
  const total = detail?.papers?.total ?? detail?.paperCount ?? taxonomyItem?.paperCount ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // Build top themes for pills (top 5 by paper count)
  const sortedThemesForPills = buildThemeGroups(mechanisms, methods, datasets, puzzles);
  const topThemes = sortedThemesForPills.slice(0, 5);

  // Scroll to and auto-expand a theme in CommonTopics
  const handleThemePillClick = useCallback((theme: string) => {
    setExpandedThemes((prev) => {
      const next = new Set(prev);
      next.add(theme);
      return next;
    });
    // Scroll to theme after a tick so the DOM has updated
    requestAnimationFrame(() => {
      const el = themeRefs.current[theme];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, []);

  // JEL code helpers: group by first letter
  const jelByPrefix: Record<string, JelCodeCount[]> = {};
  for (const jc of jelCodes) {
    const prefix = jc.code.charAt(0).toUpperCase();
    if (!jelByPrefix[prefix]) jelByPrefix[prefix] = [];
    jelByPrefix[prefix].push(jc);
  }
  // Aggregate counts per first-level code
  const jelFirstLevel = Object.entries(jelByPrefix)
    .map(([prefix, codes]) => ({
      prefix,
      totalCount: codes.reduce((s, c) => s + c.count, 0),
      subcodes: codes.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.totalCount - a.totalCount);

  const handleJelSelect = (code: string) => {
    setJelFilter(code);
    setPage(0);
  };

  const clearJelFilter = () => {
    setJelFilter(null);
    setExpandedJelPrefix(null);
    setPage(0);
  };

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "YEAR_DESC", label: "Newest" },
    { key: "YEAR_ASC", label: "Oldest" },
    { key: "SCORE_DESC", label: "Highest Score" },
    { key: "SCORE_ASC", label: "Lowest Score" },
    { key: "JEL_ASC", label: "JEL Code" },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6 max-w-5xl">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-foreground">{field}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} papers
            {jelFilter && (
              <span className="ml-2 text-blue-600 font-medium">
                (filtered by JEL: {jelFilter})
              </span>
            )}
          </p>
        </div>

        {/* Top Themes pills */}
        {topThemes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Top Themes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topThemes.map(([theme, group]) => (
                <button
                  key={theme}
                  onClick={() => handleThemePillClick(theme)}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
                >
                  {theme}
                  <span className="text-blue-500 font-normal">({group.totalPaperRefs})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Year Distribution */}
        {yearDist.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              Year Distribution
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <YearBars data={yearDist} />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{yearDist[0]?.year}</span>
                <span>{yearDist[yearDist.length - 1]?.year}</span>
              </div>
            </div>
          </div>
        ) : total > 0 && !loading ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              Year Distribution
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground italic">
                {error
                  ? "Unable to load year distribution data."
                  : "Year distribution data is not available for this field."}
              </p>
            </div>
          </div>
        ) : null}

        {/* JEL Codes */}
        {jelFirstLevel.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Hash className="h-3.5 w-3.5" />
              JEL Codes
              {jelFilter && (
                <button
                  onClick={clearJelFilter}
                  className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-100 transition-colors normal-case tracking-normal"
                >
                  <X className="h-3 w-3" />
                  Clear filter: {jelFilter}
                </button>
              )}
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              {/* First-level codes */}
              <div className="flex flex-wrap gap-1.5">
                {jelFirstLevel.map(({ prefix, totalCount }) => {
                  const isActive = jelFilter?.charAt(0) === prefix || expandedJelPrefix === prefix;
                  return (
                    <button
                      key={prefix}
                      onClick={() => {
                        if (expandedJelPrefix === prefix) {
                          setExpandedJelPrefix(null);
                        } else {
                          setExpandedJelPrefix(prefix);
                        }
                      }}
                      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : "bg-background border-border text-foreground hover:bg-accent/40"
                      }`}
                    >
                      {prefix}
                      <span className="text-muted-foreground font-normal">({totalCount})</span>
                    </button>
                  );
                })}
              </div>

              {/* Second-level codes when a prefix is expanded */}
              {expandedJelPrefix && jelByPrefix[expandedJelPrefix] && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="text-[11px] text-muted-foreground mb-2 font-medium">
                    Subcodes under {expandedJelPrefix}:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {jelByPrefix[expandedJelPrefix]
                      .sort((a, b) => b.count - a.count)
                      .map((jc) => {
                        const isSelected = jelFilter === jc.code;
                        return (
                          <button
                            key={jc.code}
                            onClick={() => handleJelSelect(jc.code)}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              isSelected
                                ? "bg-indigo-100 border-indigo-400 text-indigo-800"
                                : "bg-background border-border text-foreground hover:bg-accent/40"
                            }`}
                          >
                            <Filter className="h-3 w-3" />
                            {jc.code}
                            <span className="text-muted-foreground font-normal">({jc.count})</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Subtopic sections */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Methods */}
          <div className="space-y-2 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FlaskConical className="h-3.5 w-3.5" />
              Methods
            </div>
            <AtomBadges atoms={methods} variant="method" />
          </div>

          {/* Datasets */}
          <div className="space-y-2 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              Datasets
            </div>
            <AtomBadges atoms={datasets} variant="dataset" />
          </div>

          {/* Mechanisms */}
          <div className="space-y-2 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Cog className="h-3.5 w-3.5" />
              Mechanisms
            </div>
            <AtomBadges atoms={mechanisms} variant="mechanism" />
          </div>

          {/* Puzzles */}
          {puzzles.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <HelpCircle className="h-3.5 w-3.5" />
                Puzzles
              </div>
              <AtomBadges atoms={puzzles} variant="puzzle" />
            </div>
          )}
        </div>

        {/* Common Research Topics - grouped by theme */}
        {(mechanisms.length > 0 || methods.length > 0 || datasets.length > 0 || puzzles.length > 0) && (
          <CommonTopics
            mechanisms={mechanisms}
            methods={methods}
            datasets={datasets}
            puzzles={puzzles}
            expandedThemes={expandedThemes}
            setExpandedThemes={setExpandedThemes}
            themeRefs={themeRefs}
          />
        )}

        {/* Papers table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Papers</h3>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={sortKey}
                onChange={(e) => {
                  setSortKey(e.target.value as SortKey);
                  setPage(0);
                }}
                className="h-7 rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading && papers.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full bg-gray-100" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {papers.map((p: Paper) => (
                <Link
                  key={p.paperId}
                  href={`/paper/${p.paperId}`}
                  className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent/40 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground group-hover:text-blue-700 transition-colors line-clamp-1">
                        {p.title || p.paperId}
                      </span>
                      {p.hasCard && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          Card
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.year && (
                        <span className="text-xs text-muted-foreground">{p.year}</span>
                      )}
                      {p.authors && p.authors.length > 0 && (
                        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {p.authors.slice(0, 3).join(", ")}
                          {p.authors.length > 3 && " et al."}
                        </span>
                      )}
                      {p.averageScore != null && (
                        <span className="text-xs text-muted-foreground">
                          Score: {p.averageScore.toFixed(1)}
                        </span>
                      )}
                    </div>
                    {p.tldr && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {p.tldr}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages} ({total.toLocaleString()} papers)
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  className="h-7 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                  className="h-7 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyDetail() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <div className="text-center space-y-2">
        <BookOpen className="h-10 w-10 mx-auto opacity-40" />
        <p className="text-sm">Select a field to explore its subtopics and papers</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function FieldsPage() {
  const [selectedField, setSelectedField] = useState<string | null>(null);

  const { data, loading, error } = useQuery<{ fieldTaxonomy: FieldTaxonomyItem[] }>(
    GET_FIELD_TAXONOMY,
    { fetchPolicy: "cache-first" }
  );

  const fields = data?.fieldTaxonomy ?? [];
  const selectedItem = fields.find((f) => f.field === selectedField);

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
          Failed to load field taxonomy. Please refresh the page.
        </div>
      )}
      {/* Page header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <h1 className="text-xl font-bold text-foreground">Fields & Subtopics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Explore research by field -- see what methods, datasets, and mechanisms are used
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: field list */}
        <div className="w-[280px] shrink-0 border-r border-border bg-background">
          <FieldList
            fields={fields}
            selected={selectedField}
            onSelect={setSelectedField}
            loading={loading}
          />
        </div>

        {/* Right panel: detail */}
        <div className="flex-1 bg-background overflow-hidden">
          {selectedField ? (
            <FieldDetailPanel field={selectedField} taxonomyItem={selectedItem} />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>
    </div>
  );
}
