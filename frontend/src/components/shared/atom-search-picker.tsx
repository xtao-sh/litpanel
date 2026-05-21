"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLazyQuery } from "@apollo/client/react";
import { Search, Atom, Loader2 } from "lucide-react";
import { GET_ATOMS } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AtomItem {
  slug: string;
  type: string;
  title: string;
  description: string | null;
  evidenceStrength: string | null;
  paperCount: number;
}

interface AtomQueryResult {
  atoms: {
    items: AtomItem[];
    total: number;
  };
}

export interface AtomSearchPickerProps {
  atomType?: string; // "method", "dataset", etc.
  onSelect: (slug: string, title: string) => void;
  placeholder?: string;
  /** Additional CSS class for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Evidence strength badge color
// ---------------------------------------------------------------------------

function evidenceColor(strength: string | null): string {
  switch (strength?.toLowerCase()) {
    case "strong":
      return "text-[var(--forest-2)] bg-[var(--forest-soft)]";
    case "moderate":
      return "text-[#7a5a18] bg-[#f4ead8]";
    case "emerging":
    case "weak":
      return "text-[#8a3318] bg-[#f4dfd5]";
    default:
      return "text-[var(--ink-4)] bg-[var(--paper-2)]";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AtomSearchPicker({
  atomType,
  onSelect,
  placeholder = "Search atoms...",
  className = "",
}: AtomSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [doSearch, { data, loading }] = useLazyQuery<AtomQueryResult>(GET_ATOMS, {
    fetchPolicy: "cache-and-network",
  });

  const hits = data?.atoms?.items ?? [];

  // Debounced search
  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = value.trim();
      if (trimmed.length < 2) return;
      debounceRef.current = setTimeout(() => {
        const filter: Record<string, string> = { search: trimmed };
        if (atomType) filter.type = atomType;
        doSearch({
          variables: { filter, limit: 10, offset: 0 },
        });
      }, 300);
    },
    [doSearch, atomType]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (item: AtomItem) => {
    onSelect(item.slug, item.title);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-4)]" />
        <input
          className="lp-card w-full rounded-[0.95rem] border border-[var(--line-soft)] bg-[var(--paper)]/88 py-2 pl-9 pr-3 text-xs text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-[var(--forest)]"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            handleInputChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-[var(--ink-4)]" />
        )}
      </div>

      {/* Dropdown results */}
      {open && query.trim().length >= 2 && (
        <div className="lp-card absolute z-50 mt-2 w-full rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)]/96 p-1.5 shadow-[var(--shadow-2)]">
          {loading && hits.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-[var(--ink-4)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching...
            </div>
          )}
          {!loading && hits.length === 0 && (
            <div className="px-3 py-3 text-xs text-[var(--ink-4)]">
              No {atomType ? atomType + "s" : "atoms"} found
            </div>
          )}
          {hits.length > 0 && (
            <ul className="max-h-60 overflow-y-auto py-1">
              {hits.map((item) => (
                <li key={item.slug}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2.5 rounded-[0.9rem] px-3 py-2.5 text-left transition-colors hover:bg-[var(--paper-2)]"
                    onClick={() => handleSelect(item)}
                  >
                    <Atom className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-[var(--ink)] line-clamp-1">
                        {item.title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="rounded-full bg-[var(--paper-2)] px-1.5 py-0.5 text-[10px] text-[var(--ink-4)] capitalize">
                          {item.type}
                        </span>
                        {item.evidenceStrength && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] capitalize ${evidenceColor(item.evidenceStrength)}`}
                          >
                            {item.evidenceStrength}
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--ink-4)]">
                          {item.paperCount} papers
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
