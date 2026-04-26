"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock3,
  LayoutDashboard,
  Microscope,
  GitBranch,
  Map,
  Newspaper,
  Lightbulb,
  MessageSquare,
  Menu,
  X,
  BookOpen,
  Bookmark,
  Download,
  Globe,
  PenTool,
  Layers,
  Hash,
  FolderOpen,
  Compass,
  BookMarked,
  Wrench,
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
    id: "workspace",
    items: [
      { labelKey: "sidebar.items.setup", href: "/setup", icon: Wrench },
      { labelKey: "sidebar.items.paperManager", href: "/library", icon: Bookmark },
      { labelKey: "sidebar.items.importCenter", href: "/pipeline", icon: Download },
      { labelKey: "sidebar.items.knowledgeGraph", href: "/graph", icon: GitBranch },
      { labelKey: "sidebar.items.dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    id: "researchViews",
    items: [
      { labelKey: "sidebar.items.research", href: "/research", icon: Microscope },
      { labelKey: "sidebar.items.explorer", href: "/explorer", icon: Compass },
      { labelKey: "sidebar.items.latestResearch", href: "/latest", icon: Clock3 },
    ],
  },
  {
    id: "synthesize",
    items: [
      { labelKey: "sidebar.items.projects", href: "/projects", icon: FolderOpen },
      { labelKey: "sidebar.items.fieldMaps", href: "/maps", icon: Map },
      { labelKey: "sidebar.items.digests", href: "/digests", icon: Newspaper },
      { labelKey: "sidebar.items.chinaLens", href: "/china", icon: Globe },
    ],
  },
  {
    id: "reference",
    items: [
      { labelKey: "sidebar.items.methods", href: "/methods", icon: BookMarked },
      { labelKey: "sidebar.items.fields", href: "/fields", icon: Layers },
      { labelKey: "sidebar.items.jelCodes", href: "/jel", icon: Hash },
    ],
  },
  {
    id: "myWork",
    items: [
      { labelKey: "sidebar.items.ideas", href: "/ideas", icon: Lightbulb },
      { labelKey: "sidebar.items.workspace", href: "/ideas/workspace", icon: PenTool },
      { labelKey: "sidebar.items.ask", href: "/ask", icon: MessageSquare },
    ],
  },
];

const secondaryNavItems: NavItem[] = [];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useI18n();

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
    if (pathname === "/") return "/";
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
        className="fixed top-3 left-3 z-50 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={t("sidebar.toggleNavigation")}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[color:color-mix(in_oklch,oklch(var(--foreground))_8%,transparent)] bg-[color:oklch(var(--background)/0.9)] backdrop-blur-xl transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo / Title */}
        <div className="flex h-20 items-center gap-3 border-b border-[color:color-mix(in_oklch,oklch(var(--foreground))_8%,transparent)] px-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:color-mix(in_oklch,oklch(var(--primary))_28%,white)] bg-[color:oklch(var(--accent)/0.7)] shadow-[inset_0_1px_0_color-mix(in_oklch,oklch(var(--foreground))_12%,transparent)]">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex flex-col">
            <span className="truncate text-lg font-semibold tracking-tight text-foreground">
              {t("sidebar.brandTitle")}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <div className="space-y-4">
            {navSections.map((section, sectionIndex) => (
              <div key={section.id}>
                {sectionIndex > 0 ? <div className="mx-3 mb-4 border-t border-border/70" /> : null}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive =
                      item.href === "/"
                        ? pathname === "/"
                        : item.href === bestMatch;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                          isActive
                            ? "paper-panel text-foreground"
                            : "text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.48)] hover:text-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-xl border",
                            isActive
                              ? "border-[color:color-mix(in_oklch,oklch(var(--primary))_22%,white)] bg-[color:oklch(var(--accent)/0.7)] text-primary"
                              : "border-transparent bg-transparent text-muted-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4" style={{ strokeWidth: 1.75 }} />
                        </span>
                        <span className={cn(isActive ? "font-semibold" : "font-medium")}>{t(item.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3">
          {secondaryNavItems.length > 0 ? (
            <div className="paper-panel rounded-2xl border border-dashed px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
                        "flex h-8 items-center gap-2 rounded-xl px-2.5 text-xs transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        isActive
                          ? "bg-accent font-medium text-foreground"
                          : "text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5" style={{ strokeWidth: 1.75 }} />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : <div className="h-1" />}
        </div>
      </aside>
    </>
  );
}
