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
import { useI18n } from "@/lib/i18n/locale-context";

const entityIcons: Record<string, React.ElementType> = {
  paper: FileText,
  mechanism: Cog,
  method: FlaskConical,
  dataset: Database,
  puzzle: HelpCircle,
};

const entityDotColor: Record<string, string> = {
  paper: "bg-[#2c4870]",
  mechanism: "bg-[#b88a3b]",
  method: "bg-[var(--forest)]",
  dataset: "bg-[#2c4870]",
  puzzle: "bg-[var(--rust)]",
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

const groupOrder = ["paper", "mechanism", "method", "dataset", "puzzle"];

interface CommandSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const router = useRouter();
  const { t } = useI18n();
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
      router.push(`/paper/${encodeURIComponent(entityId)}`);
    } else {
      router.push(`/atom/${encodeURIComponent(entityId)}`);
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
    <CommandDialog open={open} onOpenChange={handleOpenChange} aria-label={t("commandSearch.ariaLabel")}>
      <CommandInput
        placeholder={t("commandSearch.placeholder")}
        value={inputValue}
        onValueChange={handleInputChange}
      />
      <CommandList className="max-h-[400px]" aria-live="polite" aria-atomic="false">
        {/* Loading state */}
        {loading && hasQuery && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--ink-4)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("commandSearch.searching")}</span>
          </div>
        )}

        {/* Error state */}
        {error && hasQuery && !loading && (
          <div className="py-8 text-center text-sm text-[var(--rust)]">
            {t("commandSearch.unavailable")}
          </div>
        )}

        {/* Empty state when no query */}
        {!hasQuery && !loading && (
          <CommandEmpty>
            <div className="mx-auto max-w-sm space-y-2 px-4">
              <p className="section-kicker">{t("commandSearch.quickLookupKicker")}</p>
              <p className="font-display text-[1.35rem] text-[var(--ink)]">{t("commandSearch.quickLookupTitle")}</p>
              <p>{t("commandSearch.quickLookupBody")}</p>
            </div>
          </CommandEmpty>
        )}

        {/* No results state */}
        {hasQuery && !loading && !error && !hasResults && (
          <CommandEmpty>
            <div className="space-y-1 px-4">
              <p className="section-kicker">{t("commandSearch.noMatchesKicker")}</p>
              <p className="text-sm text-[var(--ink)]">{t("commandSearch.noMatchesBody")}</p>
            </div>
          </CommandEmpty>
        )}

        {/* Results */}
        {!loading && !error && hasResults &&
          sortedGroupKeys.map((type) => {
            const items = grouped[type];
            const Icon = entityIcons[type] || FileText;
            return (
              <CommandGroup key={type} heading={t(`commandSearch.groups.${type}`)}>
                {items.map((hit) => (
                  <CommandItem
                    key={`${hit.entityType}-${hit.entityId}-${hit.rank}`}
                    value={`${hit.title} ${hit.entityId}`}
                    onSelect={() => navigateTo(hit.entityType, hit.entityId)}
                    className="flex items-start gap-3"
                  >
                    <div className="relative mt-0.5 shrink-0">
                      <Icon className="h-4 w-4 text-[var(--ink-4)]" />
                      <span className={`absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ${entityDotColor[hit.entityType] || "bg-[var(--ink-4)]"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <span className="truncate font-medium text-[var(--ink)]" title={hit.title}>
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
                          className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--ink-4)] [&_mark]:rounded-full [&_mark]:bg-[var(--paper-3)] [&_mark]:px-1 [&_mark]:py-0.5 [&_mark]:text-[var(--ink)]"
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
      <div className="flex items-center justify-between border-t border-[var(--line-soft)] bg-[var(--paper-2)] px-4 py-3">
        <div className="flex items-center gap-3 text-xs text-[var(--ink-4)]">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-1.5 py-0.5 font-mono text-[10px]">&uarr;&darr;</kbd>
            <span>{t("commandSearch.footer.navigate")}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-1.5 py-0.5 font-mono text-[10px]">&crarr;</kbd>
            <span>{t("commandSearch.footer.open")}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-1.5 py-0.5 font-mono text-[10px]">esc</kbd>
            <span>{t("commandSearch.footer.close")}</span>
          </span>
        </div>
        {hasQuery && !loading && !error && hasResults && (
          <span className="text-xs text-[var(--ink-4)]">
            {t("commandSearch.footer.results", { count: hits.length })} / {total}
          </span>
        )}
      </div>
    </CommandDialog>
  );
}
