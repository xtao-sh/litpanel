"use client";

import React, { useState, useRef, useCallback } from "react";
import { Search, SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import type { ResearchFilter } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";

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
  { value: "", labelKey: "research.queryBar.sort.relevance" },
  { value: "YEAR_DESC", labelKey: "research.queryBar.sort.yearDesc" },
  { value: "YEAR_ASC", labelKey: "research.queryBar.sort.yearAsc" },
  { value: "SCORE_DESC", labelKey: "research.queryBar.sort.scoreDesc" },
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
  const { t } = useI18n();
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
    <div className="sticky top-0 z-20 border-b border-[var(--line-soft)] bg-[var(--paper)] backdrop-blur-md">
      {/* Main query row */}
      <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
        <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-3">
          <div className="lp-card relative flex-1 rounded-[var(--r-md)] p-1.5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-4)]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t("research.queryBar.placeholder")}
              className="flex h-11 w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--paper)]/75 pl-10 pr-4 text-sm ring-offset-[var(--paper)] placeholder:text-[var(--ink-4)] focus-visible:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-2"
            />
          </div>
          <Button type="submit" size="default" className="h-11 rounded-full px-6">
            {t("common.actions.search")}
          </Button>
        </form>

        {/* Results count */}
        {totalPapers !== null && (
          <span className="hidden shrink-0 text-sm text-[var(--ink-4)] sm:block">
            {t("common.counts.matchedPapers", { count: totalPapers.toLocaleString() })}
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
            {t(SORT_OPTIONS.find((s) => s.value === sort)?.labelKey ?? "research.queryBar.sortFallback")}
            <ChevronDown className="h-3 w-3" />
          </Button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortOpen(false)} />
              <div className="lp-card absolute right-0 top-full z-40 mt-2 w-44 rounded-[var(--r-md)] p-1 shadow-none">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`flex w-full items-center rounded-[0.8rem] px-3 py-1.5 text-sm transition-colors ${
                      sort === opt.value
                        ? "bg-[var(--paper-3)] font-medium text-[var(--ink)]"
                        : "text-[var(--ink-4)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                    }`}
                    onClick={() => {
                      onSortChange(opt.value);
                      setSortOpen(false);
                    }}
                  >
                    {t(opt.labelKey)}
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
          {t("research.queryBar.filters")}
          {activeFilterCount > 0 && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--paper-2)] px-1 text-[10px] font-bold text-[var(--forest)]">
              {activeFilterCount}
            </span>
          )}
        </Button>
        {!filtersOpen && activeFilterCount === 0 && (
          <span className="hidden sm:inline text-[11px] text-[var(--ink-4)]/70 ml-1">{t("research.queryBar.tip")}</span>
        )}

        {/* Extra action buttons (e.g., Save Session) */}
        {extraActions}
      </div>

      {/* Active filter chips */}
      {(filters.atomSlugs?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2 lg:px-6">
          <span className="text-xs text-[var(--ink-4)]">{t("research.queryBar.filteringBy")}</span>
          {filters.atomSlugs?.map((slug) => (
            <Badge
              key={slug}
              variant="secondary"
              className="cursor-pointer gap-1 rounded-full text-xs hover:bg-[var(--rust)]/10"
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
        <div className="border-t border-[var(--line-soft)] bg-[var(--paper-2)] px-4 py-4 lg:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Fields */}
            <div className="lp-card rounded-[var(--r-md)] p-4 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                {t("research.queryBar.fields")}
              </h4>
              <div className="max-h-48 space-y-1.5 overflow-y-auto">
                {PAPER_FIELDS.map((field) => (
                  <label
                    key={field}
                    className="flex cursor-pointer items-center gap-2 text-xs text-[var(--ink-3)] hover:text-[var(--ink)]"
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
            <div className="lp-card rounded-[var(--r-md)] p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                {t("research.queryBar.yearRange")}
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
              <div className="flex justify-between text-xs font-medium text-[var(--ink-4)]">
                <span>{filters.yearMin ?? 2000}</span>
                <span>{filters.yearMax ?? 2026}</span>
              </div>
            </div>

            {/* Score range */}
            <div className="lp-card rounded-[var(--r-md)] p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                {t("research.queryBar.scoreRange")}
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
              <div className="flex justify-between text-xs font-medium text-[var(--ink-4)]">
                <span>{(filters.scoreMin ?? 1).toFixed(1)}</span>
                <span>{(filters.scoreMax ?? 5).toFixed(1)}</span>
              </div>
            </div>

            {/* Has Card */}
            <div className="lp-card rounded-[var(--r-md)] p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                {t("research.queryBar.options")}
              </h4>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--ink-3)] hover:text-[var(--ink)]">
                <Checkbox
                  checked={filters.hasCard === true}
                  onCheckedChange={(checked) =>
                    onFiltersChange({
                      ...filters,
                      hasCard: checked ? true : undefined,
                    })
                  }
                />
                <span>{t("research.queryBar.onlyWithCards")}</span>
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
                {t("research.queryBar.clearAllFilters")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
