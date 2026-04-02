"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLazyQuery } from "@apollo/client/react";
import { Search, FileText, Loader2 } from "lucide-react";
import { SEARCH } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchHit {
  entityType: string;
  entityId: string;
  title: string;
  snippet: string;
  rank: number;
}

interface SearchResult {
  search: {
    hits: SearchHit[];
    total: number;
  };
}

export interface PaperSearchPickerProps {
  onSelect: (paperId: string, title: string) => void;
  placeholder?: string;
  /** Additional CSS class for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaperSearchPicker({
  onSelect,
  placeholder = "Search papers by title or ID...",
  className = "",
}: PaperSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [doSearch, { data, loading }] = useLazyQuery<SearchResult>(SEARCH, {
    fetchPolicy: "cache-and-network",
  });

  const hits = data?.search?.hits ?? [];

  // Debounced search
  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = value.trim();
      if (trimmed.length < 2) return;
      debounceRef.current = setTimeout(() => {
        doSearch({
          variables: { query: trimmed, entityType: "paper", limit: 10 },
        });
      }, 300);
    },
    [doSearch]
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

  const handleSelect = (hit: SearchHit) => {
    onSelect(hit.entityId, hit.title);
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
              No papers found
            </div>
          )}
          {hits.length > 0 && (
            <ul className="max-h-60 overflow-y-auto py-1">
              {hits.map((hit) => (
                <li key={hit.entityId}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-blue-50 transition-colors"
                    onClick={() => handleSelect(hit)}
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-gray-800 line-clamp-2">
                        {hit.title}
                      </div>
                      <span className="text-[10px] font-mono text-gray-400">
                        {hit.entityId}
                      </span>
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
