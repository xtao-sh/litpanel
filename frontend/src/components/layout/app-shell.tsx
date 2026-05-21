"use client";

import React, { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { CommandSearch } from "@/components/search/command-search";
import { getApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/locale-context";
import {
  getStoredActiveLibraryId,
  resolveInitialLibraryId,
  setStoredActiveLibraryId,
} from "@/lib/libraries";
import type { Library } from "@/lib/types";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [hasLoadedSidebarPreference, setHasLoadedSidebarPreference] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSidebarPinned(localStorage.getItem("litdesk-sidebar-pinned") === "true");
      setHasLoadedSidebarPreference(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hasLoadedSidebarPreference) return;
    localStorage.setItem("litdesk-sidebar-pinned", String(sidebarPinned));
  }, [hasLoadedSidebarPreference, sidebarPinned]);

  useEffect(() => {
    let active = true;

    async function validateActiveLibrary() {
      try {
        const response = await fetch(`${getApiUrl()}/api/libraries`);
        if (!response.ok) return;
        const payload = (await response.json()) as { libraries?: Library[] };
        if (!active) return;
        const libraries = payload.libraries ?? [];
        const current = getStoredActiveLibraryId();
        const next = resolveInitialLibraryId(libraries);
        if (next !== current) {
          setStoredActiveLibraryId(next);
        }
      } catch {
        // Keep the stored selection if the API is unavailable during startup.
      }
    }

    void validateActiveLibrary();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-[var(--r)] focus:bg-[var(--ink)] focus:px-4 focus:py-2 focus:text-[var(--paper)] focus:shadow-[var(--shadow-2)]">
        {t("app.skipToMain")}
      </a>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(rgba(10,10,10,0.018)_1px,transparent_1px)] bg-[size:3px_3px] opacity-60 mix-blend-multiply dark:mix-blend-screen" />
      <Sidebar
        pinned={hasLoadedSidebarPreference ? sidebarPinned : false}
        onPinnedChange={setSidebarPinned}
        onExpandedChange={setSidebarExpanded}
      />
      <div
        className={cn(
          "relative transition-[padding] duration-200",
          hasLoadedSidebarPreference && sidebarExpanded ? "sm:pl-60" : "sm:pl-20",
        )}
      >
        <Header onOpenSearch={() => setSearchOpen(true)} />
        <main id="main-content" className="relative">
          <div className="lp-page">{children}</div>
        </main>
      </div>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
