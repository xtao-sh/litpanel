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
      return "text-emerald-700 bg-emerald-50";
    case "moderate":
      return "text-amber-700 bg-amber-50";
    case "emerging":
    case "weak":
      return "text-rose-700 bg-rose-50";
    default:
      return "text-muted-foreground bg-muted";
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
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          className="paper-panel w-full rounded-[0.95rem] border border-border/75 bg-background/88 py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/35"
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
          <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Dropdown results */}
      {open && query.trim().length >= 2 && (
        <div className="paper-panel absolute z-50 mt-2 w-full rounded-[1rem] border border-border/75 bg-background/96 p-1.5 shadow-[0_18px_44px_rgba(44,51,71,0.16)]">
          {loading && hits.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching...
            </div>
          )}
          {!loading && hits.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No {atomType ? atomType + "s" : "atoms"} found
            </div>
          )}
          {hits.length > 0 && (
            <ul className="max-h-60 overflow-y-auto py-1">
              {hits.map((item) => (
                <li key={item.slug}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2.5 rounded-[0.9rem] px-3 py-2.5 text-left transition-colors hover:bg-[color:oklch(var(--accent)/0.45)]"
                    onClick={() => handleSelect(item)}
                  >
                    <Atom className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-foreground line-clamp-1">
                        {item.title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground capitalize">
                          {item.type}
                        </span>
                        {item.evidenceStrength && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] capitalize ${evidenceColor(item.evidenceStrength)}`}
                          >
                            {item.evidenceStrength}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
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
