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
      return "text-green-700 bg-green-50";
    case "moderate":
      return "text-amber-700 bg-amber-50";
    case "emerging":
    case "weak":
      return "text-red-700 bg-red-50";
    default:
      return "text-gray-600 bg-gray-50";
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
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full rounded-md border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {/* Dropdown results */}
      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          {loading && hits.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching...
            </div>
          )}
          {!loading && hits.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-400">
              No {atomType ? atomType + "s" : "atoms"} found
            </div>
          )}
          {hits.length > 0 && (
            <ul className="max-h-60 overflow-y-auto py-1">
              {hits.map((item) => (
                <li key={item.slug}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-blue-50 transition-colors"
                    onClick={() => handleSelect(item)}
                  >
                    <Atom className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-gray-800 line-clamp-1">
                        {item.title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="rounded bg-gray-100 px-1 py-0 text-[10px] text-gray-500 capitalize">
                          {item.type}
                        </span>
                        {item.evidenceStrength && (
                          <span
                            className={`rounded px-1 py-0 text-[10px] capitalize ${evidenceColor(item.evidenceStrength)}`}
                          >
                            {item.evidenceStrength}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
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
