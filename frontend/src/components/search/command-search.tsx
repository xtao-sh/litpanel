"use client";

import React, { useEffect, useCallback, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLazyQuery } from "@apollo/client/react";
import {
  FileText,
  Cog,
  FlaskConical,
  Database,
  HelpCircle,
  Loader2,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { SEARCH } from "@/lib/queries";
import type { SearchHit, SearchResult } from "@/lib/types";

const entityIcons: Record<string, React.ElementType> = {
  paper: FileText,
  mechanism: Cog,
  method: FlaskConical,
  dataset: Database,
  puzzle: HelpCircle,
};

const entityDotColor: Record<string, string> = {
  paper: "bg-blue-500",
  mechanism: "bg-orange-500",
  method: "bg-green-500",
  dataset: "bg-purple-500",
  puzzle: "bg-red-500",
};

const entityBadgeVariant: Record<
  string,
  "paper" | "mechanism" | "method" | "dataset" | "puzzle"
> = {
  paper: "paper",
  mechanism: "mechanism",
  method: "method",
  dataset: "dataset",
  puzzle: "puzzle",
};

const groupLabels: Record<string, string> = {
  paper: "Papers",
  mechanism: "Mechanisms",
  method: "Methods",
  dataset: "Datasets",
  puzzle: "Puzzles",
};

const groupOrder = ["paper", "mechanism", "method", "dataset", "puzzle"];

interface CommandSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [executeSearch, { data, loading, error }] = useLazyQuery<{
    search: SearchResult;
  }>(SEARCH);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setInputValue("");
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  // Keyboard shortcut: Cmd+K / Ctrl+K
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        handleOpenChange(!open);
      }
    },
    [open, handleOpenChange]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Debounced search
  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (value.trim().length === 0) {
        return;
      }

      debounceTimerRef.current = setTimeout(() => {
        executeSearch({
          variables: { query: value.trim(), entityType: null, limit: 20 },
        });
      }, 300);
    },
    [executeSearch]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  function navigateTo(entityType: string, entityId: string) {
    handleOpenChange(false);
    if (entityType === "paper") {
      router.push(`/paper/${entityId}`);
    } else {
      router.push(`/atom/${entityId}`);
    }
  }

  // Group hits by entity type
  const hits: SearchHit[] = data?.search?.hits || [];
  const total: number = data?.search?.total || 0;

  const grouped = hits.reduce(
    (acc, hit) => {
      if (!acc[hit.entityType]) acc[hit.entityType] = [];
      acc[hit.entityType].push(hit);
      return acc;
    },
    {} as Record<string, SearchHit[]>
  );

  // Sort groups by predefined order
  const sortedGroupKeys = Object.keys(grouped).sort(
    (a, b) => groupOrder.indexOf(a) - groupOrder.indexOf(b)
  );

  const hasQuery = inputValue.trim().length > 0;
  const hasResults = hits.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder="Search papers, mechanisms, methods, datasets..."
        value={inputValue}
        onValueChange={handleInputChange}
      />
      <CommandList className="max-h-[400px]">
        {/* Loading state */}
        {loading && hasQuery && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Searching...</span>
          </div>
        )}

        {/* Error state */}
        {error && hasQuery && !loading && (
          <div className="py-6 text-center text-sm text-red-500">
            Search unavailable. Please try again later.
          </div>
        )}

        {/* Empty state when no query */}
        {!hasQuery && !loading && (
          <CommandEmpty>Type to search across all entities...</CommandEmpty>
        )}

        {/* No results state */}
        {hasQuery && !loading && !error && !hasResults && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {/* Results */}
        {!loading && !error && hasResults &&
          sortedGroupKeys.map((type) => {
            const items = grouped[type];
            const Icon = entityIcons[type] || FileText;
            return (
              <CommandGroup key={type} heading={groupLabels[type] || type}>
                {items.map((hit) => (
                  <CommandItem
                    key={`${hit.entityType}-${hit.entityId}-${hit.rank}`}
                    value={`${hit.title} ${hit.entityId}`}
                    onSelect={() => navigateTo(hit.entityType, hit.entityId)}
                    className="flex items-start gap-2"
                  >
                    <div className="relative mt-0.5 shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className={`absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ${entityDotColor[hit.entityType] || "bg-gray-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {hit.title}
                        </span>
                        <Badge
                          variant={entityBadgeVariant[hit.entityType] || "secondary"}
                          className="shrink-0 text-xs"
                        >
                          {hit.entityType}
                        </Badge>
                      </div>
                      {hit.snippet && (
                        <div
                          className="mt-0.5 truncate text-xs text-muted-foreground [&_mark]:bg-yellow-200 [&_mark]:text-foreground [&_mark]:rounded-sm [&_mark]:px-0.5"
                          dangerouslySetInnerHTML={{ __html: hit.snippet }}
                        />
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
      </CommandList>

      {/* Footer with result count + keyboard hints */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">&uarr;&darr;</kbd>
            <span>Navigate</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">&crarr;</kbd>
            <span>Open</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">esc</kbd>
            <span>Close</span>
          </span>
        </div>
        {hasQuery && !loading && !error && hasResults && (
          <span className="text-xs text-muted-foreground">
            {hits.length} of {total}
          </span>
        )}
      </div>
    </CommandDialog>
  );
}
