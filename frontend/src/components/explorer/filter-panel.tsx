"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLazyQuery, useQuery } from "@apollo/client/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, SlidersHorizontal, User, ChevronDown, ChevronUp, Atom } from "lucide-react";
import { GET_AUTHOR_SUGGESTIONS, GET_AVAILABLE_METHODS, GET_AVAILABLE_FIELDS, GET_ATOMS, GET_AVAILABLE_THEMES } from "@/lib/queries";
import { useI18n } from "@/lib/i18n/locale-context";
import type { ScoreDimensionFilter } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Fallback fields used before the dynamic query loads
const FALLBACK_PAPER_FIELDS = [
  "Empirical Methods",
  "Industrial Organization",
  "Labor Economics",
  "Public Economics",
  "Macroeconomics",
  "Finance",
  "Health Economics",
  "Digital Economy & AI",
  "Development Economics",
  "Behavioral Economics",
  "Innovation & Entrepreneurship",
  "Political Economy",
  "Environmental Economics",
  "International Trade",
  "Education",
  "Economic History",
  "Urban Economics",
  "Economic Theory",
];

const TRIAGE_OPTIONS = ["DEEP_READ", "SKIM", "SKIP"];
const ATOM_TYPES = ["mechanism", "method", "dataset", "puzzle"];
const EVIDENCE_OPTIONS = ["strong", "moderate", "weak"];
const ACCESS_OPTIONS = ["public", "restricted", "administrative", "commercial"];
const IDEA_STATUSES = ["new", "developing", "promoted", "killed"];

function translateValue(t: (key: string, vars?: Record<string, string | number>) => string, value: string): string {
  const key = value === "DEEP_READ" ? "deepRead" : value === "SKIM" ? "skim" : value === "SKIP" ? "skip" : value;
  return t(`explorer.values.${key}`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaperFilters {
  search: string;
  fields: string[];
  yearMin: number | null;
  yearMax: number | null;
  scoreMin: number | null;
  scoreMax: number | null;
  triageDecision: string[];
  hasCard: boolean | null;
  authors: string[];
  methods: string[];
  scoreDimensions: ScoreDimensionFilter[];
  atomSlugs: string[];
}

export interface AtomFilters {
  search: string;
  types: string[];
  evidenceStrength: string[];
  access: string[];
  theme: string;
}

export interface IdeaFilters {
  search: string;
  statuses: string[];
}

export const defaultPaperFilters: PaperFilters = {
  search: "",
  fields: [],
  yearMin: null,
  yearMax: null,
  scoreMin: null,
  scoreMax: null,
  triageDecision: [],
  hasCard: null,
  authors: [],
  methods: [],
  scoreDimensions: [],
  atomSlugs: [],
};

export const defaultAtomFilters: AtomFilters = {
  search: "",
  types: [],
  evidenceStrength: [],
  access: [],
  theme: "",
};

export const defaultIdeaFilters: IdeaFilters = {
  search: "",
  statuses: [],
};

// ---------------------------------------------------------------------------
// Checkbox group helper
// ---------------------------------------------------------------------------

function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
  formatLabel,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  formatLabel?: (v: string) => string;
}) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const activeCount = selected.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
          {label}
        </h4>
        {activeCount > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[10px] font-medium text-[var(--paper)]">
            {activeCount}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
          >
            <Checkbox
              checked={selected.includes(option)}
              onCheckedChange={() => toggle(option)}
            />
            <span className="truncate">
              {formatLabel ? formatLabel(option) : option}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Author Search with Autocomplete
// ---------------------------------------------------------------------------

function AuthorSearch({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (authors: string[]) => void;
}) {
  const { t } = useI18n();
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [fetchSuggestions, { data: suggestionsData }] = useLazyQuery<{
    authorSuggestions: string[];
  }>(GET_AUTHOR_SUGGESTIONS);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      if (value.length >= 2) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          fetchSuggestions({ variables: { query: value, limit: 15 } });
          setShowDropdown(true);
        }, 250);
      } else {
        setShowDropdown(false);
      }
    },
    [fetchSuggestions]
  );

  const addAuthor = useCallback(
    (name: string) => {
      if (!selected.includes(name)) {
        onChange([...selected, name]);
      }
      setInputValue("");
      setShowDropdown(false);
    },
    [selected, onChange]
  );

  const removeAuthor = useCallback(
    (name: string) => {
      onChange(selected.filter((a) => a !== name));
    },
    [selected, onChange]
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const suggestions = (suggestionsData?.authorSuggestions ?? []).filter(
    (s) => !selected.includes(s)
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
          {t("explorer.filters.authors")}
        </h4>
        {selected.length > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[10px] font-medium text-[var(--paper)]">
            {selected.length}
          </span>
        )}
      </div>

      <div className="relative">
        <User className="absolute left-2 top-2 h-3.5 w-3.5 text-[var(--ink-5)]" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (inputValue.length >= 2 && suggestions.length > 0) {
              setShowDropdown(true);
            }
          }}
          placeholder={t("explorer.filters.authorPlaceholder")}
          className="h-8 w-full rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] pl-7 pr-2 text-xs placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-1 focus:ring-[var(--forest)]"
        />
        {showDropdown && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] shadow-[var(--shadow-2)]"
          >
            {suggestions.map((name) => (
              <button
                key={name}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-[var(--ink)] hover:bg-[var(--paper-2)] transition-colors"
                onClick={() => addAuthor(name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--forest)]"
            >
              {name.length > 20 ? name.slice(0, 18) + ".." : name}
              <button
                onClick={() => removeAuthor(name)}
                className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-[var(--paper-2)]"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Method Filter (checkboxes from triage_cards)
// ---------------------------------------------------------------------------

/** Top methods to show initially (most common) */
const TOP_METHODS_LIMIT = 12;

function MethodFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (methods: string[]) => void;
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);

  const { data } = useQuery<{ availableMethods: string[] }>(
    GET_AVAILABLE_METHODS
  );
  const allMethods = data?.availableMethods ?? [];
  const displayMethods = showAll
    ? allMethods
    : allMethods.slice(0, TOP_METHODS_LIMIT);

  const toggle = useCallback(
    (method: string) => {
      if (selected.includes(method)) {
        onChange(selected.filter((m) => m !== method));
      } else {
        onChange([...selected, method]);
      }
    },
    [selected, onChange]
  );

  const formatMethodLabel = (m: string) =>
    m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (allMethods.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
          {t("explorer.filters.methods")}
        </h4>
        {selected.length > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[10px] font-medium text-[var(--paper)]">
            {selected.length}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {displayMethods.map((method) => (
          <label
            key={method}
            className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
          >
            <Checkbox
              checked={selected.includes(method)}
              onCheckedChange={() => toggle(method)}
            />
            <span className="truncate text-xs">
              {formatMethodLabel(method)}
            </span>
          </label>
        ))}
      </div>
      {allMethods.length > TOP_METHODS_LIMIT && (
        <button
          className="text-xs font-medium text-[var(--forest)] transition-colors hover:text-[var(--forest)]/80"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll
            ? t("explorer.filters.showFewer")
            : t("explorer.filters.showAllMethods", { count: allMethods.length })}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Atom Filter (search & select atoms to filter papers)
// ---------------------------------------------------------------------------

const ATOM_TYPE_COLORS: Record<string, string> = {
  mechanism: "bg-[#f4ead8] text-[#654814]",
  method: "bg-[var(--forest-soft)] text-[var(--forest-2)]",
  dataset: "bg-[#e9eef6] text-[#1b2e4d]",
  puzzle: "bg-[#f4dfd5] text-[#742b14]",
};

function AtomSearch({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (slugs: string[]) => void;
}) {
  const { t } = useI18n();
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [fetchAtoms, { data: atomsData }] = useLazyQuery<{
    atoms: { items: { slug: string; title: string; type: string; paperCount: number }[] };
  }>(GET_ATOMS);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      if (value.length >= 2) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          fetchAtoms({ variables: { filter: { search: value }, limit: 15, offset: 0 } });
          setShowDropdown(true);
        }, 250);
      } else {
        setShowDropdown(false);
      }
    },
    [fetchAtoms]
  );

  const addAtom = useCallback(
    (slug: string) => {
      if (!selected.includes(slug)) {
        onChange([...selected, slug]);
      }
      setInputValue("");
      setShowDropdown(false);
    },
    [selected, onChange]
  );

  const removeAtom = useCallback(
    (slug: string) => {
      onChange(selected.filter((s) => s !== slug));
    },
    [selected, onChange]
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const suggestions = (atomsData?.atoms?.items ?? []).filter(
    (a) => !selected.includes(a.slug)
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
          {t("explorer.filters.atoms")}
        </h4>
        {selected.length > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[10px] font-medium text-[var(--paper)]">
            {selected.length}
          </span>
        )}
      </div>

      <div className="relative">
        <Atom className="absolute left-2 top-2 h-3.5 w-3.5 text-[var(--ink-5)]" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (inputValue.length >= 2 && suggestions.length > 0) {
              setShowDropdown(true);
            }
          }}
          placeholder={t("explorer.filters.atomPlaceholder")}
          className="h-8 w-full rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] pl-7 pr-2 text-xs placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-1 focus:ring-[var(--forest)]"
        />
        {showDropdown && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] shadow-[var(--shadow-2)]"
          >
            {suggestions.map((atom) => (
              <button
                key={atom.slug}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--ink)] hover:bg-[var(--paper-2)] transition-colors"
                onClick={() => addAtom(atom.slug)}
              >
                <span
                  className={`inline-block rounded px-1 py-0.5 text-[10px] font-medium ${ATOM_TYPE_COLORS[atom.type] || "bg-[var(--paper-2)] text-[var(--ink-2)]"}`}
                >
                  {translateValue(t, atom.type)}
                </span>
                <span className="truncate flex-1">{atom.title}</span>
                <span className="shrink-0 text-[10px] text-[var(--ink-4)]">
                  {atom.paperCount}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((slug) => (
            <span
              key={slug}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--forest)]"
            >
              {slug.length > 25 ? slug.slice(0, 23) + ".." : slug.replace(/_/g, " ")}
              <button
                onClick={() => removeAtom(slug)}
                className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-[var(--paper-2)]"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <p className="text-[10px] text-[var(--ink-4)]">
          {t("explorer.filters.atomsMustMatchAll")}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dynamic Field Filter (loads from backend, falls back to static list)
// ---------------------------------------------------------------------------

const TOP_FIELDS_LIMIT = 12;

function DynamicFieldFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (fields: string[]) => void;
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");

  const { data } = useQuery<{ availableFields: string[] }>(
    GET_AVAILABLE_FIELDS
  );
  const allFields = data?.availableFields ?? FALLBACK_PAPER_FIELDS;

  // Client-side filtering of field options when searching
  const filteredFields = fieldSearch.trim()
    ? allFields.filter((f) =>
        f.toLowerCase().includes(fieldSearch.trim().toLowerCase())
      )
    : showAll
      ? allFields
      : allFields.slice(0, TOP_FIELDS_LIMIT);

  const toggle = useCallback(
    (field: string) => {
      if (selected.includes(field)) {
        onChange(selected.filter((f) => f !== field));
      } else {
        onChange([...selected, field]);
      }
    },
    [selected, onChange]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
          {t("explorer.filters.fields")}
        </h4>
        {selected.length > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[10px] font-medium text-[var(--paper)]">
            {selected.length}
          </span>
        )}
      </div>
      {allFields.length > 10 && (
        <div className="relative">
          <Search className="absolute left-2 top-1.5 h-3 w-3 text-[var(--ink-4)]" />
          <input
            type="text"
            value={fieldSearch}
            onChange={(e) => setFieldSearch(e.target.value)}
            placeholder={t("explorer.filters.fieldPlaceholder")}
            className="h-7 w-full rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] pl-6 pr-2 text-[11px] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-1 focus:ring-[var(--forest)]"
          />
        </div>
      )}
      <div className="space-y-2">
        {filteredFields.map((field) => (
          <label
            key={field}
            className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
          >
            <Checkbox
              checked={selected.includes(field)}
              onCheckedChange={() => toggle(field)}
            />
            <span className="truncate text-xs">{field}</span>
          </label>
        ))}
        {fieldSearch.trim() && filteredFields.length === 0 && (
          <p className="text-[11px] text-[var(--ink-4)]">
            {t("explorer.empty.noFields", { query: fieldSearch.trim() })}
          </p>
        )}
      </div>
      {!fieldSearch.trim() && allFields.length > TOP_FIELDS_LIMIT && (
        <button
          className="text-xs font-medium text-[var(--forest)] transition-colors hover:text-[var(--forest)]/80"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? t("explorer.filters.showFewer") : t("explorer.filters.showAllFields", { count: allFields.length })}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score Dimension Filter
// ---------------------------------------------------------------------------

const SCORE_DIMENSIONS = [
  "empirical_rigor",
  "theoretical_contribution",
  "novelty_of_approach",
  "data_quality",
  "identification_strategy",
  "robustness_of_results",
  "clarity_of_writing",
  "relevance_to_policy",
  "literature_awareness",
  "replicability",
  "statistical_methods",
  "external_validity",
  "internal_validity",
  "contribution_to_field",
  "overall_quality",
];

function formatDimensionName(dim: string): string {
  return dim.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const MIN_SCORE_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 3, label: "\u22653" },
  { value: 4, label: "\u22654" },
  { value: 5, label: "=5" },
];

function ScoreDimensionFilterSection({
  selected,
  onChange,
}: {
  selected: ScoreDimensionFilter[];
  onChange: (dims: ScoreDimensionFilter[]) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const activeCount = selected.length;

  const handleDimensionChange = useCallback(
    (dimension: string, minScore: number) => {
      if (minScore === 0) {
        // Remove this dimension filter
        onChange(selected.filter((d) => d.dimension !== dimension));
      } else {
        const existing = selected.find((d) => d.dimension === dimension);
        if (existing) {
          onChange(
            selected.map((d) =>
              d.dimension === dimension ? { ...d, minScore } : d
            )
          );
        } else {
          onChange([...selected, { dimension, minScore }]);
        }
      }
    },
    [selected, onChange]
  );

  const getSelectedScore = (dimension: string): number => {
    const found = selected.find((d) => d.dimension === dimension);
    return found ? found.minScore : 0;
  };

  return (
    <div className="space-y-2">
      <button
        className="flex w-full items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
            {t("explorer.filters.scoreDimensions")}
          </h4>
          {activeCount > 0 && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[10px] font-medium text-[var(--paper)]">
              {activeCount}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-[var(--ink-4)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-4)]" />
        )}
      </button>

      {expanded && (
        <div className="grid grid-cols-1 gap-1.5">
          {SCORE_DIMENSIONS.map((dim) => {
            const currentScore = getSelectedScore(dim);
            return (
              <div
                key={dim}
                className="flex items-center justify-between gap-1.5"
              >
                <span className="truncate text-[11px] text-[var(--ink-3)]">
                  {formatDimensionName(dim)}
                </span>
                <div className="flex shrink-0 gap-0.5">
                  {MIN_SCORE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleDimensionChange(dim, opt.value)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                        currentScore === opt.value
                          ? "bg-[var(--ink)] text-[var(--paper)]"
                          : "bg-[var(--paper-2)] text-[var(--ink-4)] hover:bg-[var(--paper-2)]"
                      }`}
                    >
                      {opt.value === 0 ? t("explorer.filters.any") : opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paper Filters
// ---------------------------------------------------------------------------

function PaperFilterControls({
  filters,
  onChange,
}: {
  filters: PaperFilters;
  onChange: (f: PaperFilters) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <AtomSearch
        selected={filters.atomSlugs}
        onChange={(atomSlugs) => onChange({ ...filters, atomSlugs })}
      />

      <AuthorSearch
        selected={filters.authors}
        onChange={(authors) => onChange({ ...filters, authors })}
      />

      <MethodFilter
        selected={filters.methods}
        onChange={(methods) => onChange({ ...filters, methods })}
      />

      <DynamicFieldFilter
        selected={filters.fields}
        onChange={(fields) => onChange({ ...filters, fields })}
      />

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
          {t("explorer.filters.yearRange")}
        </h4>
        <Slider
          min={2000}
          max={2026}
          step={1}
          value={[filters.yearMin ?? 2000, filters.yearMax ?? 2026]}
          onValueChange={([min, max]: number[]) =>
            onChange({
              ...filters,
              yearMin: min === 2000 ? null : min,
              yearMax: max === 2026 ? null : max,
            })
          }
        />
        <div className="flex justify-between text-xs font-medium text-[var(--ink-4)]">
          <span>{filters.yearMin ?? 2000}</span>
          <span>{filters.yearMax ?? 2026}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
          {t("explorer.filters.scoreRange")}
        </h4>
        <Slider
          min={1}
          max={5}
          step={0.1}
          value={[filters.scoreMin ?? 1, filters.scoreMax ?? 5]}
          onValueChange={([min, max]: number[]) =>
            onChange({
              ...filters,
              scoreMin: min === 1 ? null : min,
              scoreMax: max === 5 ? null : max,
            })
          }
        />
        <div className="flex justify-between text-xs font-medium text-[var(--ink-4)]">
          <span>{(filters.scoreMin ?? 1).toFixed(1)}</span>
          <span>{(filters.scoreMax ?? 5).toFixed(1)}</span>
        </div>
      </div>

      <CheckboxGroup
        label={t("explorer.filters.triageDecision")}
        options={TRIAGE_OPTIONS}
        selected={filters.triageDecision}
        onChange={(triageDecision) => onChange({ ...filters, triageDecision })}
        formatLabel={(v) => translateValue(t, v)}
      />

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
          {t("explorer.filters.hasCard")}
        </h4>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
          <Checkbox
            checked={filters.hasCard === true}
            onCheckedChange={(checked) =>
              onChange({ ...filters, hasCard: checked ? true : null })
            }
          />
          <span>{t("explorer.filters.onlyWithCards")}</span>
        </label>
      </div>

      <ScoreDimensionFilterSection
        selected={filters.scoreDimensions}
        onChange={(scoreDimensions) => onChange({ ...filters, scoreDimensions })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Atom Filters
// ---------------------------------------------------------------------------

function AtomFilterControls({
  filters,
  onChange,
}: {
  filters: AtomFilters;
  onChange: (f: AtomFilters) => void;
}) {
  const { t } = useI18n();
  const showAccessFilter =
    filters.types.length === 0 || filters.types.includes("dataset");

  // Fetch available themes, optionally filtered by atom type
  const selectedType = filters.types.length === 1 ? filters.types[0] : null;
  const { data: themesData } = useQuery<{ availableThemes: string[] }>(
    GET_AVAILABLE_THEMES,
    {
      variables: selectedType ? { atomType: selectedType } : {},
      fetchPolicy: "cache-first",
    }
  );
  const availableThemes = themesData?.availableThemes ?? [];

  return (
    <div className="space-y-5">
      <CheckboxGroup
        label={t("explorer.filters.type")}
        options={ATOM_TYPES}
        selected={filters.types}
        onChange={(types) => onChange({ ...filters, types, theme: "" })}
        formatLabel={(v) => translateValue(t, v)}
      />

      {/* Theme dropdown filter */}
      {availableThemes.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
            {t("explorer.filters.theme")}
          </label>
          <select
            value={filters.theme}
            onChange={(e) => onChange({ ...filters, theme: e.target.value })}
            className="w-full h-8 rounded border border-[var(--line)] bg-[var(--paper)] px-2 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--forest)]"
          >
            <option value="">{t("explorer.filters.allThemes")}</option>
            {availableThemes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      <CheckboxGroup
        label={t("explorer.filters.evidenceStrength")}
        options={EVIDENCE_OPTIONS}
        selected={filters.evidenceStrength}
        onChange={(evidenceStrength) =>
          onChange({ ...filters, evidenceStrength })
        }
        formatLabel={(v) => translateValue(t, v)}
      />
      {showAccessFilter && (
        <CheckboxGroup
          label={t("explorer.filters.datasetAccess")}
          options={ACCESS_OPTIONS}
          selected={filters.access}
          onChange={(access) => onChange({ ...filters, access })}
          formatLabel={(v) => translateValue(t, v)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idea Filters
// ---------------------------------------------------------------------------

function IdeaFilterControls({
  filters,
  onChange,
}: {
  filters: IdeaFilters;
  onChange: (f: IdeaFilters) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <CheckboxGroup
        label={t("explorer.filters.status")}
        options={IDEA_STATUSES}
        selected={filters.statuses}
        onChange={(statuses) => onChange({ ...filters, statuses })}
        formatLabel={(v) => translateValue(t, v)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Filter Panel
// ---------------------------------------------------------------------------

interface FilterPanelProps {
  activeTab: string;
  paperFilters: PaperFilters;
  atomFilters: AtomFilters;
  ideaFilters: IdeaFilters;
  onPaperFiltersChange: (f: PaperFilters) => void;
  onAtomFiltersChange: (f: AtomFilters) => void;
  onIdeaFiltersChange: (f: IdeaFilters) => void;
  onClearFilters: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function FilterPanel({
  activeTab,
  paperFilters,
  atomFilters,
  ideaFilters,
  onPaperFiltersChange,
  onAtomFiltersChange,
  onIdeaFiltersChange,
  onClearFilters,
  mobileOpen,
  onMobileClose,
}: FilterPanelProps) {
  const { t } = useI18n();
  const searchValue =
    activeTab === "papers"
      ? paperFilters.search
      : activeTab === "atoms"
        ? atomFilters.search
        : ideaFilters.search;

  const onSearchChange = (value: string) => {
    if (activeTab === "papers") {
      onPaperFiltersChange({ ...paperFilters, search: value });
    } else if (activeTab === "atoms") {
      onAtomFiltersChange({ ...atomFilters, search: value });
    } else {
      onIdeaFiltersChange({ ...ideaFilters, search: value });
    }
  };

  // Compute whether any filters are active
  const hasActiveFilters = (() => {
    if (activeTab === "papers") {
      return (
        paperFilters.fields.length > 0 ||
        paperFilters.triageDecision.length > 0 ||
        paperFilters.yearMin !== null ||
        paperFilters.yearMax !== null ||
        paperFilters.scoreMin !== null ||
        paperFilters.scoreMax !== null ||
        paperFilters.hasCard !== null ||
        paperFilters.search.length > 0 ||
        paperFilters.authors.length > 0 ||
        paperFilters.methods.length > 0 ||
        paperFilters.scoreDimensions.length > 0 ||
        paperFilters.atomSlugs.length > 0
      );
    }
    if (activeTab === "atoms") {
      return (
        atomFilters.types.length > 0 ||
        atomFilters.evidenceStrength.length > 0 ||
        atomFilters.access.length > 0 ||
        atomFilters.search.length > 0 ||
        atomFilters.theme.length > 0
      );
    }
    return ideaFilters.statuses.length > 0 || ideaFilters.search.length > 0;
  })();

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <SlidersHorizontal className="h-4 w-4" />
          {t("explorer.filters.title")}
        </div>
        <button
          className="rounded p-1 text-[var(--ink-4)] hover:text-[var(--ink)] transition-colors lg:hidden"
          onClick={onMobileClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--ink-4)]" />
          <Input
            placeholder={t("explorer.filters.searchPlaceholder")}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 rounded-[var(--r)] border-[var(--line-soft)] bg-[var(--paper)] pl-9 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        <div className="pr-2">
          {activeTab === "papers" && (
            <PaperFilterControls
              filters={paperFilters}
              onChange={onPaperFiltersChange}
            />
          )}
          {activeTab === "atoms" && (
            <AtomFilterControls
              filters={atomFilters}
              onChange={onAtomFiltersChange}
            />
          )}
          {activeTab === "ideas" && (
            <IdeaFilterControls
              filters={ideaFilters}
              onChange={onIdeaFiltersChange}
            />
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-[var(--line-soft)] px-4 py-3">
        <Button
          variant={hasActiveFilters ? "default" : "outline"}
          size="sm"
          className="w-full rounded-full"
          onClick={onClearFilters}
        >
          {t("explorer.actions.clearFilters")}
          {hasActiveFilters && " *"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] shrink-0 border-r border-[var(--line-soft)] bg-[var(--paper)] lg:flex lg:flex-col">
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-[var(--ink)]/30 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <aside className="absolute inset-y-0 left-0 w-[280px] border-r border-[var(--line-soft)] bg-[var(--paper)]/95 shadow-[var(--shadow-2)] backdrop-blur-sm">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
