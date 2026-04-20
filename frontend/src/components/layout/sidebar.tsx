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
  Sparkles,
  BookMarked,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

interface NavSection {
  label: string;
  description: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: "Start Here",
    description: "Recency-first, topic-first, and corpus-level discovery entry points.",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Latest Research", href: "/latest", icon: Clock3 },
      { label: "Research", href: "/research", icon: Microscope },
      { label: "Explorer", href: "/explorer", icon: Compass },
    ],
  },
  {
    label: "Synthesize",
    description: "Turn evidence into thematic reviews and summaries.",
    items: [
      { label: "Projects", href: "/projects", icon: FolderOpen },
      { label: "Field Maps", href: "/maps", icon: Map },
      { label: "Digests", href: "/digests", icon: Newspaper },
      { label: "China Lens", href: "/china", icon: Globe },
    ],
  },
  {
    label: "Reference",
    description: "Browse methods, taxonomies, and graph views.",
    items: [
      { label: "Methods", href: "/methods", icon: BookMarked },
      { label: "Fields", href: "/fields", icon: Layers },
      { label: "JEL Codes", href: "/jel", icon: Hash },
      { label: "Knowledge Graph", href: "/graph", icon: GitBranch },
    ],
  },
  {
    label: "My Work",
    description: "Personal ideas, notes, and workflow tools.",
    items: [
      { label: "Ideas", href: "/ideas", icon: Lightbulb },
      { label: "Workspace", href: "/ideas/workspace", icon: PenTool },
      { label: "Library", href: "/library", icon: Bookmark },
      { label: "Ask", href: "/ask", icon: MessageSquare },
    ],
  },
];

const secondaryNavItems: NavItem[] = [
  { label: "Pipeline", href: "/pipeline", icon: Download },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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
        aria-label="Toggle navigation"
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
        <div className="flex h-20 items-center gap-3 border-b border-[color:color-mix(in_oklch,oklch(var(--foreground))_8%,transparent)] px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:color-mix(in_oklch,oklch(var(--primary))_28%,white)] bg-[color:oklch(var(--accent)/0.6)]">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="section-kicker">Research Desk</span>
            <span className="font-display text-[1.45rem] text-foreground leading-none">NBER</span>
            <span className="text-xs text-muted-foreground">Question-led literature navigation</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <div className="space-y-6">
            {navSections.map((section) => (
              <div key={section.label}>
                <div className="px-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {section.label}
                  </p>
                  <p className="mb-2 text-[11px] leading-4 text-muted-foreground/80">
                    {section.description}
                  </p>
                </div>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive =
                      item.href === "/"
                        ? pathname === "/"
                        : item.href === bestMatch;

                    return (
                      <Link
                        key={item.label}
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
                        <span className={cn(isActive ? "font-semibold" : "font-medium")}>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <div className="paper-panel rounded-2xl border border-dashed px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Internal
            </p>
            <div className="mt-2 space-y-1">
              {secondaryNavItems.map((item) => {
                const isActive = item.href === bestMatch;
                return (
                  <Link
                    key={item.label}
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
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-[color:color-mix(in_oklch,oklch(var(--primary))_12%,white)] bg-[color:oklch(var(--accent)/0.68)] px-3 py-3 text-xs text-foreground">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              Workflow Guide
            </div>
            <p className="mt-1 leading-5 text-muted-foreground">
              Start with a live question in Research, inspect evidence in Explorer, then promote a stable corpus into Projects.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
