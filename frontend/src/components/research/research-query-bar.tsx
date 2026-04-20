"use client";

import React, { useState, useRef, useCallback } from "react";
import { Search, SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import type { ResearchFilter } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAPER_FIELDS = [
  "Industrial Organization",
  "Health Economics",
  "Labor Studies",
  "Public Economics",
  "Corporate Finance",
  "Asset Pricing",
  "Development Economics",
  "International Trade",
  "Monetary Economics",
  "Economic Fluctuations and Growth",
  "International Finance and Macroeconomics",
  "Environment and Energy Economics",
  "Economics of Education",
  "Political Economy",
  "Productivity, Innovation, and Entrepreneurship",
  "Law and Economics",
  "Health Care",
  "Children and Families",
  "Economics of Aging",
];

const SORT_OPTIONS = [
  { value: "", label: "Relevance" },
  { value: "YEAR_DESC", label: "Year (newest)" },
  { value: "YEAR_ASC", label: "Year (oldest)" },
  { value: "SCORE_DESC", label: "Score (highest)" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResearchQueryBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
  totalPapers: number | null;
  sort: string;
  onSortChange: (sort: string) => void;
  filters: ResearchFilter;
  onFiltersChange: (f: ResearchFilter) => void;
  /** Optional extra action button(s) rendered after filters */
  extraActions?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResearchQueryBar({
  query,
  onQueryChange,
  onSubmit,
  totalPapers,
  sort,
  onSortChange,
  filters,
  onFiltersChange,
  extraActions,
}: ResearchQueryBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit();
    },
    [onSubmit]
  );

  // Count active filters
  const activeFilterCount = [
    (filters.fields?.length ?? 0) > 0,
    filters.yearMin != null,
    filters.yearMax != null,
    filters.scoreMin != null,
    filters.scoreMax != null,
    filters.hasCard != null,
    (filters.atomSlugs?.length ?? 0) > 0,
  ].filter(Boolean).length;

  const clearAtomFilter = useCallback(
    (slug: string) => {
      const next = (filters.atomSlugs ?? []).filter((s) => s !== slug);
      onFiltersChange({
        ...filters,
        atomSlugs: next.length > 0 ? next : undefined,
      });
    },
    [filters, onFiltersChange]
  );

  return (
    <div className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md">
      {/* Main query row */}
      <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
        <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-3">
          <div className="paper-panel relative flex-1 rounded-[1.35rem] p-1.5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search a research topic..."
              className="flex h-11 w-full rounded-[1rem] border border-input bg-background/75 pl-10 pr-4 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <Button type="submit" size="default" className="h-11 rounded-full px-6">
            Search
          </Button>
        </form>

        {/* Results count */}
        {totalPapers !== null && (
          <span className="hidden shrink-0 text-sm text-muted-foreground sm:block">
            {totalPapers.toLocaleString()} matched paper{totalPapers !== 1 ? "s" : ""}
          </span>
        )}

        {/* Sort */}
        <div className="relative" ref={sortRef}>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full text-xs"
            onClick={() => setSortOpen(!sortOpen)}
          >
            {SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Sort"}
            <ChevronDown className="h-3 w-3" />
          </Button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortOpen(false)} />
              <div className="paper-panel absolute right-0 top-full z-40 mt-2 w-44 rounded-[1rem] p-1 shadow-none">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`flex w-full items-center rounded-[0.8rem] px-3 py-1.5 text-sm transition-colors ${
                      sort === opt.value
                        ? "bg-[color:oklch(var(--accent)/0.58)] font-medium text-foreground"
                        : "text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.45)] hover:text-foreground"
                    }`}
                    onClick={() => {
                      onSortChange(opt.value);
                      setSortOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Filters toggle */}
        <Button
          variant={filtersOpen ? "default" : "outline"}
          size="sm"
          className="gap-1.5 rounded-full text-xs"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] font-bold text-primary">
              {activeFilterCount}
            </span>
          )}
        </Button>
        {!filtersOpen && activeFilterCount === 0 && (
          <span className="hidden sm:inline text-[11px] text-muted-foreground/70 ml-1">Tip: filter by field, year, or score</span>
        )}

        {/* Extra action buttons (e.g., Save Session) */}
        {extraActions}
      </div>

      {/* Active filter chips */}
      {(filters.atomSlugs?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2 lg:px-6">
          <span className="text-xs text-muted-foreground">Filtering by:</span>
          {filters.atomSlugs?.map((slug) => (
            <Badge
              key={slug}
              variant="secondary"
              className="cursor-pointer gap-1 rounded-full text-xs hover:bg-destructive/10"
              onClick={() => clearAtomFilter(slug)}
            >
              {slug}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}

      {/* Filter popover */}
      {filtersOpen && (
        <div className="border-t border-border/70 bg-[color:oklch(var(--accent)/0.18)] px-4 py-4 lg:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Fields */}
            <div className="paper-panel rounded-[1.25rem] p-4 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Fields
              </h4>
              <div className="max-h-48 space-y-1.5 overflow-y-auto">
                {PAPER_FIELDS.map((field) => (
                  <label
                    key={field}
                    className="flex cursor-pointer items-center gap-2 text-xs text-foreground/80 hover:text-foreground"
                  >
                    <Checkbox
                      checked={(filters.fields ?? []).includes(field)}
                      onCheckedChange={(checked) => {
                        const current = filters.fields ?? [];
                        const next = checked
                          ? [...current, field]
                          : current.filter((f) => f !== field);
                        onFiltersChange({
                          ...filters,
                          fields: next.length > 0 ? next : undefined,
                        });
                      }}
                    />
                    <span className="truncate">{field}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Year range */}
            <div className="paper-panel rounded-[1.25rem] p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Year Range
              </h4>
              <Slider
                min={2000}
                max={2026}
                step={1}
                value={[filters.yearMin ?? 2000, filters.yearMax ?? 2026]}
                onValueChange={([min, max]: number[]) =>
                  onFiltersChange({
                    ...filters,
                    yearMin: min === 2000 ? undefined : min,
                    yearMax: max === 2026 ? undefined : max,
                  })
                }
              />
              <div className="flex justify-between text-xs font-medium text-muted-foreground">
                <span>{filters.yearMin ?? 2000}</span>
                <span>{filters.yearMax ?? 2026}</span>
              </div>
            </div>

            {/* Score range */}
            <div className="paper-panel rounded-[1.25rem] p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Score Range
              </h4>
              <Slider
                min={1}
                max={5}
                step={0.1}
                value={[filters.scoreMin ?? 1, filters.scoreMax ?? 5]}
                onValueChange={([min, max]: number[]) =>
                  onFiltersChange({
                    ...filters,
                    scoreMin: min === 1 ? undefined : min,
                    scoreMax: max === 5 ? undefined : max,
                  })
                }
              />
              <div className="flex justify-between text-xs font-medium text-muted-foreground">
                <span>{(filters.scoreMin ?? 1).toFixed(1)}</span>
                <span>{(filters.scoreMax ?? 5).toFixed(1)}</span>
              </div>
            </div>

            {/* Has Card */}
            <div className="paper-panel rounded-[1.25rem] p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Options
              </h4>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground/80 hover:text-foreground">
                <Checkbox
                  checked={filters.hasCard === true}
                  onCheckedChange={(checked) =>
                    onFiltersChange({
                      ...filters,
                      hasCard: checked ? true : undefined,
                    })
                  }
                />
                <span>Only papers with cards</span>
              </label>
            </div>
          </div>

          {/* Clear filters */}
          {activeFilterCount > 0 && (
            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() =>
                  onFiltersChange({})
                }
              >
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
