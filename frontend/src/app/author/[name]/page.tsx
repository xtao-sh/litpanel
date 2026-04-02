"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { ArrowLeft, Users, BookOpen, TrendingUp, FlaskConical, Search, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

import { GET_AUTHOR } from "@/lib/queries";
import type { AuthorProfile } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreBadgeColor(score: number | null): string {
  if (score === null) return "bg-muted text-muted-foreground";
  if (score >= 8) return "bg-emerald-100 text-emerald-800 font-semibold";
  if (score >= 6) return "bg-blue-100 text-blue-800 font-semibold";
  if (score >= 4) return "bg-amber-100 text-amber-800 font-medium";
  return "bg-muted text-muted-foreground";
}

function truncateTitle(title: string | null, max: number = 70): string {
  if (!title) return "Untitled";
  if (title.length <= max) return title;
  return title.slice(0, max - 1) + "\u2026";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AuthorPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: rawName } = use(params);
  const authorName = decodeURIComponent(rawName);

  const { data, loading, error } = useQuery<{ author: AuthorProfile | null }>(
    GET_AUTHOR,
    { variables: { name: authorName } }
  );

  const author = data?.author;

  // ------ Loading state ------
  if (loading) {
    return (
      <div className="animate-in space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // ------ Not found ------
  if (error || !author) {
    return (
      <div className="animate-in space-y-4">
        <Link
          href="/explorer"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Explorer
        </Link>
        <h2 className="text-2xl font-semibold text-gray-900">Author Not Found</h2>
        <p className="text-muted-foreground">
          No papers found for &ldquo;{authorName}&rdquo;.
        </p>
      </div>
    );
  }

  // ------ Render ------
  return (
    <div className="animate-in space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/explorer" className="hover:text-foreground transition-colors">
          Explorer
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{author.name}</span>
      </div>

      {/* Heading */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          {author.name}
        </h2>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4 px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <BookOpen className="h-4 w-4 text-blue-600" style={{ strokeWidth: 1.75 }} />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground leading-tight">
                {author.paperCount}
              </p>
              <p className="text-xs text-muted-foreground">Papers</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 py-4 px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
              <TrendingUp className="h-4 w-4 text-emerald-600" style={{ strokeWidth: 1.75 }} />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground leading-tight">
                {author.avgScore !== null ? author.avgScore.toFixed(1) : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Avg Score</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 py-4 px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
              <Users className="h-4 w-4 text-purple-600" style={{ strokeWidth: 1.75 }} />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground leading-tight">
                {author.coauthors.length}
              </p>
              <p className="text-xs text-muted-foreground">Co-authors</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 py-4 px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <FlaskConical className="h-4 w-4 text-amber-600" style={{ strokeWidth: 1.75 }} />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground leading-tight">
                {author.fields.length}
              </p>
              <p className="text-xs text-muted-foreground">Fields</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fields & Methods badges */}
      {(author.fields.length > 0 || author.methods.length > 0) && (
        <div className="flex flex-wrap gap-4">
          {author.fields.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Fields</h3>
              <div className="flex flex-wrap gap-1.5">
                {author.fields.map((f) => (
                  <Badge key={f.field} variant="secondary" className="text-xs">
                    {f.field}
                    <span className="ml-1 text-muted-foreground">({f.count})</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {author.methods.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Methods</h3>
              <div className="flex flex-wrap gap-1.5">
                {author.methods.map((m) => (
                  <Badge key={m.field} variant="outline" className="text-xs">
                    {m.field}
                    <span className="ml-1 text-muted-foreground">({m.count})</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Papers table */}
      <PapersTable papers={author.papers} paperCount={author.paperCount} />

      {/* Co-authors */}
      {author.coauthors.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Co-authors ({author.coauthors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
              {author.coauthors.map((ca) => (
                <Link
                  key={ca.name}
                  href={`/author/${encodeURIComponent(ca.name)}`}
                  className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-accent/60 transition-colors group"
                >
                  <span className="text-sm text-foreground group-hover:text-primary transition-colors truncate">
                    {ca.name}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {ca.sharedPapers} shared
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Papers table with search, sort, and pagination
// ---------------------------------------------------------------------------

const PAPERS_PER_PAGE = 20;

type SortKey = "year" | "score";
type SortDir = "asc" | "desc";

function PapersTable({
  papers,
  paperCount,
}: {
  papers: AuthorProfile["papers"];
  paperCount: number;
}) {
  const [searchFilter, setSearchFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("year");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    const q = searchFilter.toLowerCase().trim();
    if (!q) return papers;
    return papers.filter(
      (p) =>
        (p.title || "").toLowerCase().includes(q) ||
        p.paperId.toLowerCase().includes(q) ||
        p.fields.some((f) => f.toLowerCase().includes(q))
    );
  }, [papers, searchFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "year") {
        cmp = (a.year ?? 0) - (b.year ?? 0);
      } else {
        cmp = (a.averageScore ?? 0) - (b.averageScore ?? 0);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAPERS_PER_PAGE);
  const paginated = sorted.slice(
    page * PAPERS_PER_PAGE,
    (page + 1) * PAPERS_PER_PAGE
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold">
            Papers ({filtered.length === papers.length ? paperCount : `${filtered.length} / ${paperCount}`})
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => {
                  setSearchFilter(e.target.value);
                  setPage(0);
                }}
                placeholder="Filter papers..."
                className="h-8 w-48 rounded-md border border-gray-200 bg-white pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              />
            </div>
            {/* Sort toggles */}
            <Button
              variant={sortKey === "year" ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => toggleSort("year")}
            >
              <ArrowUpDown className="h-3 w-3" />
              Year {sortKey === "year" && (sortDir === "desc" ? "\u2193" : "\u2191")}
            </Button>
            <Button
              variant={sortKey === "score" ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => toggleSort("score")}
            >
              <ArrowUpDown className="h-3 w-3" />
              Score {sortKey === "score" && (sortDir === "desc" ? "\u2193" : "\u2191")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={300}>
          <div className="space-y-0.5">
            {paginated.map((paper) => {
              const fullTitle = paper.title || "Untitled";
              const displayTitle = truncateTitle(paper.title);
              const needsTooltip = fullTitle.length > 70;

              const rowContent = (
                <Link
                  key={paper.paperId}
                  href={`/paper/${paper.paperId}`}
                  className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-accent/60 transition-colors group"
                >
                  <span className="text-sm text-foreground flex-1 min-w-0 truncate group-hover:text-primary transition-colors">
                    {displayTitle}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {paper.fields.slice(0, 2).map((f) => (
                      <Badge
                        key={f}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 hidden sm:inline-flex"
                      >
                        {f}
                      </Badge>
                    ))}
                    {paper.year && (
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {paper.year}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${scoreBadgeColor(paper.averageScore)}`}
                    >
                      {paper.averageScore !== null
                        ? paper.averageScore.toFixed(1)
                        : "--"}
                    </span>
                  </div>
                </Link>
              );

              if (needsTooltip) {
                return (
                  <Tooltip key={paper.paperId}>
                    <TooltipTrigger asChild>{rowContent}</TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <p className="text-sm">{fullTitle}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return rowContent;
            })}
            {paginated.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No papers match your filter.
              </p>
            )}
          </div>
        </TooltipProvider>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
            <p className="text-xs text-muted-foreground">
              Showing {page * PAPERS_PER_PAGE + 1}
              &ndash;
              {Math.min((page + 1) * PAPERS_PER_PAGE, sorted.length)} of{" "}
              {sorted.length}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
