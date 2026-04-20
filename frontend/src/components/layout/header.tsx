"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Search, Moon, Sun, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/latest": "Latest Research",
  "/explorer": "Explorer",
  "/graph": "Knowledge Graph",
  "/maps": "Field Maps",
  "/projects": "Projects",
  "/ideas": "Ideas",
  "/ask": "Ask",
  "/digests": "Digests",
  "/library": "Library",
  "/research": "Research",
  "/china": "China Lens",
  "/pipeline": "Pipeline",
  "/compare": "Compare Papers",
  "/ideas/workspace": "My Workspace",
  "/methods": "Methods",
  "/fields": "Fields",
  "/jel": "JEL Codes",
};

const pageDescriptions: Record<string, string> = {
  "/": "Live signals, topic movement, and the next dossier to open.",
  "/latest": "Follow recency, topic momentum, and emerging paper clusters.",
  "/research": "Move from query to topic workspace, then to a stable paper set.",
  "/explorer": "Inspect papers, atoms, and evidence without losing the corpus context.",
  "/projects": "Read curated reviews and research drafts as working dossiers.",
  "/graph": "Trace how papers and atoms connect across a topic or corpus.",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith("/paper/")) return "Paper Detail";
  if (pathname.startsWith("/atom/")) return "Atom Detail";
  if (pathname.startsWith("/maps/")) return "Field Map";
  if (pathname.startsWith("/projects/")) {
    if (pathname.endsWith("/dossier")) return "Project Dossier";
    if (pathname.endsWith("/chronology")) return "Project Chronology";
    if (pathname.endsWith("/themes")) return "Project Themes";
    if (pathname.endsWith("/methods")) return "Project Methods";
    if (pathname.endsWith("/gaps")) return "Project Gaps";
    if (pathname.endsWith("/matrix")) return "Project Matrix";
    return "Project Overview";
  }
  return "NBER Research";
}

function getPageDescription(pathname: string): string {
  if (pageDescriptions[pathname]) return pageDescriptions[pathname];
  if (pathname.startsWith("/projects/")) return "Chronology, themes, methods, gaps, and paper comparison in one dossier.";
  if (pathname.startsWith("/paper/")) return "Read the paper, inspect evidence, then reopen it in graph or comparison views.";
  if (pathname.startsWith("/atom/")) return "Follow one method, mechanism, dataset, or puzzle through related papers.";
  return "Research navigation for literature review, synthesis, and idea development.";
}

interface Breadcrumb {
  parentHref: string;
  parentLabel: string;
  currentLabel: string;
}

function getBreadcrumb(pathname: string): Breadcrumb | null {
  if (pathname.startsWith("/paper/")) {
    return { parentHref: "/explorer", parentLabel: "Explorer", currentLabel: "Paper Detail" };
  }
  if (pathname.startsWith("/atom/")) {
    return { parentHref: "/explorer", parentLabel: "Explorer", currentLabel: "Atom Detail" };
  }
  if (pathname.startsWith("/projects/") && pathname !== "/projects") {
    const title = getPageTitle(pathname);
    return { parentHref: "/projects", parentLabel: "Projects", currentLabel: title };
  }
  if (pathname.startsWith("/maps/") && pathname !== "/maps") {
    return { parentHref: "/maps", parentLabel: "Field Maps", currentLabel: "Field Map" };
  }
  return null;
}

interface HeaderProps {
  onOpenSearch: () => void;
}

export function Header({ onOpenSearch }: HeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const description = getPageDescription(pathname);
  const breadcrumb = getBreadcrumb(pathname);
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b border-[color:color-mix(in_oklch,oklch(var(--foreground))_8%,transparent)] bg-[color:oklch(var(--background)/0.86)] backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-[1540px] items-center justify-between px-4 lg:px-8">
        <div className="pl-10 lg:pl-0">
          <p className="section-kicker">Research Dashboard</p>
          <h1 className="font-display text-[1.45rem] text-foreground">{title}</h1>
          <p className="hidden text-sm text-muted-foreground lg:block">{description}</p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-0.5 text-muted-foreground hover:text-foreground lg:hidden"
            title={description}
            aria-label="Page description"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
          {breadcrumb && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link href={breadcrumb.parentHref} className="hover:text-primary transition-colors">{breadcrumb.parentLabel}</Link>
              <span>/</span>
              <span className="text-foreground/70">{breadcrumb.currentLabel}</span>
            </div>
          )}
        </div>

        {/* Right: Search trigger + theme toggle */}
        <div className="flex items-center gap-2">
          <button
            className="hidden items-center gap-2 rounded-full border border-[color:color-mix(in_oklch,oklch(var(--foreground))_8%,transparent)] bg-[color:oklch(var(--card)/0.86)] px-4 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-[color:oklch(var(--accent)/0.52)] hover:text-foreground sm:flex"
            onClick={onOpenSearch}
          >
            <Search className="h-4 w-4" />
            <span>Search papers, methods, or topics</span>
            <kbd className="pointer-events-none ml-4 inline-flex h-5 select-none items-center gap-0.5 rounded-full border border-border bg-background px-1.5 font-mono text-xs font-medium text-muted-foreground">
              <span className="text-xs">&#8984;</span>K
            </kbd>
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full border border-transparent hover:border-border"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="rounded-full sm:hidden"
            onClick={onOpenSearch}
            aria-label="Open search"
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
