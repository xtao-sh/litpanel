"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Microscope,
  Lightbulb,
  Menu,
  X,
  BookOpen,
  BookOpenText,
  Bookmark,
  Download,
  FolderOpen,
  Wrench,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/locale-context";

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

interface NavSection {
  id: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    id: "primary",
    items: [
      { labelKey: "sidebar.items.evidenceBrowser", href: "/explorer", icon: BookOpen },
      { labelKey: "sidebar.items.setup", href: "/setup", icon: Wrench },
      { labelKey: "sidebar.items.importCenter", href: "/pipeline", icon: Download },
      { labelKey: "sidebar.items.paperManager", href: "/library", icon: Bookmark },
      { labelKey: "sidebar.items.research", href: "/research", icon: Microscope },
      { labelKey: "sidebar.items.ideas", href: "/ideas", icon: Lightbulb },
      { labelKey: "sidebar.items.projects", href: "/projects", icon: FolderOpen },
    ],
  },
];

const secondaryNavItems: NavItem[] = [];

interface SidebarProps {
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  onExpandedChange?: (expanded: boolean) => void;
}

export function Sidebar({ pinned, onPinnedChange, onExpandedChange }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { t } = useI18n();
  const expanded = pinned || hovered || mobileOpen;

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  // Collect all nav hrefs to determine the best (longest) prefix match
  const allNavItems = useMemo(() => {
    const items: NavItem[] = [];
    for (const section of navSections) {
      items.push(...section.items);
    }
    items.push(...secondaryNavItems);
    return items;
  }, []);

  const bestMatch = useMemo(() => {
    if (pathname === "/") return "";
    let best = "";
    for (const item of allNavItems) {
      if (item.href === "/") continue;
      if (pathname === item.href || pathname.startsWith(item.href + "/") || pathname.startsWith(item.href + "?")) {
        if (item.href.length > best.length) {
          best = item.href;
        }
      }
    }
    return best;
  }, [pathname, allNavItems]);

  return (
    <>
      {/* Mobile toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "fixed z-50 transition-[left,top] duration-200 sm:hidden",
          mobileOpen ? "left-[min(18.75rem,calc(100vw-3rem))] top-5" : "left-3 top-3"
        )}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={t("sidebar.toggleNavigation")}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[var(--ink)]/50 sm:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[var(--line-soft)] bg-[color:color-mix(in_srgb,var(--paper)_94%,transparent)] shadow-[var(--shadow-2)] backdrop-blur-md transition-[transform,width] duration-200 ease-out sm:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0",
          expanded ? "sm:w-60" : "sm:w-20"
        )}
      >
        {/* Logo / Title */}
        <div
          className={cn(
            "flex h-16 items-center border-b border-[var(--line-soft)] transition-[gap,padding] duration-200",
            expanded ? "gap-3 px-5" : "justify-center px-3"
          )}
        >
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className="lp-card relative flex h-10 w-10 shrink-0 items-center justify-center transition-colors hover:bg-[var(--paper-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-2"
            aria-label={t("sidebar.home")}
            title={t("sidebar.home")}
          >
            <BookOpenText className="h-6 w-6 text-[var(--forest)]" style={{ strokeWidth: 1.65 }} />
            <Sparkles className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-[var(--paper)] p-0.5 text-[var(--forest)]" />
          </Link>
          <div
            className={cn(
              "min-w-0 flex-1 flex-col overflow-hidden transition-opacity duration-150",
              expanded ? "flex opacity-100" : "hidden opacity-0"
            )}
          >
            <span className="truncate font-serif text-lg font-semibold tracking-tight text-[var(--ink)]">
              {t("sidebar.brandTitle")}
            </span>
            {expanded && (
              <button
                type="button"
                onClick={() => onPinnedChange(!pinned)}
                className="lp-meta mt-1 hidden w-fit items-center gap-1.5 rounded-full transition-colors hover:text-[var(--ink)] sm:inline-flex"
                aria-label={pinned ? t("sidebar.unpin") : t("sidebar.pin")}
                title={pinned ? t("sidebar.unpin") : t("sidebar.pin")}
              >
                {pinned ? (
                  <PanelLeftClose className="h-3.5 w-3.5" />
                ) : (
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                )}
                {pinned ? t("sidebar.unpin") : t("sidebar.pin")}
              </button>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <div className="space-y-4">
            {navSections.map((section, sectionIndex) => (
              <div key={section.id}>
                {sectionIndex > 0 ? <div className="mx-3 mb-4 border-t border-[var(--line-soft)]" /> : null}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = item.href === "/" ? pathname === "/" : item.href === bestMatch;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        title={!expanded ? t(item.labelKey) : undefined}
                        className={cn(
                          "grid min-h-10 items-center rounded-[var(--r)] px-3 py-2.5 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-1",
                          expanded ? "grid-cols-[2rem_minmax(0,1fr)] gap-3" : "grid-cols-[2rem] gap-0",
                          isActive
                            ? "lp-card text-[var(--ink)]"
                            : "text-[var(--ink-4)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] border",
                            isActive
                              ? "border-[var(--line-soft)] bg-[var(--paper-2)] text-[var(--forest)]"
                              : "border-transparent bg-transparent text-[var(--ink-4)]"
                          )}
                        >
                          <item.icon className="h-4 w-4" style={{ strokeWidth: 1.75 }} />
                        </span>
                        <span
                          className={cn(
                            "min-w-0 truncate transition-opacity duration-150",
                            expanded ? "opacity-100" : "hidden opacity-0",
                            isActive ? "font-semibold" : "font-medium"
                          )}
                        >
                          {t(item.labelKey)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--line-soft)] px-3 py-3">
          {secondaryNavItems.length > 0 ? (
            <div className="lp-card rounded-[var(--r)] border border-dashed px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-4)]">
                Internal
              </p>
              <div className="mt-2 space-y-1">
                {secondaryNavItems.map((item) => {
                  const isActive = item.href === bestMatch;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex h-8 items-center gap-2 rounded-[var(--r)] px-2.5 text-xs transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-1",
                        isActive
                          ? "bg-[var(--paper-2)] font-medium text-[var(--ink)]"
                          : "text-[var(--ink-4)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5" style={{ strokeWidth: 1.75 }} />
                      <span className={cn(expanded ? "inline" : "hidden")}>{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onPinnedChange(!pinned)}
              className={cn(
                "hidden h-10 w-full items-center rounded-[var(--r)] border border-[var(--line-soft)] px-3 text-sm text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)] sm:grid",
                expanded ? "grid-cols-[1rem_minmax(0,1fr)] gap-3" : "grid-cols-[1rem] gap-0"
              )}
              aria-label={pinned ? t("sidebar.unpin") : t("sidebar.pin")}
              title={pinned ? t("sidebar.unpin") : t("sidebar.pin")}
            >
              {pinned ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
              <span className={cn("truncate", expanded ? "inline" : "hidden")}>
                {pinned ? t("sidebar.unpin") : t("sidebar.pin")}
              </span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
