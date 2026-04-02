"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Search, Moon, Sun } from "lucide-react";
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

interface HeaderProps {
  onOpenSearch: () => void;
}

export function Header({ onOpenSearch }: HeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md lg:px-8">
      {/* Left: Page title (with left padding on mobile for hamburger) */}
      <div className="pl-10 lg:pl-0">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>

      {/* Right: Search trigger + theme toggle */}
      <div className="flex items-center gap-2">
        <button
          className="hidden items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted/80 sm:flex"
          onClick={onOpenSearch}
        >
          <Search className="h-4 w-4" />
          <span>Search...</span>
          <kbd className="pointer-events-none ml-4 inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-xs font-medium text-muted-foreground">
            <span className="text-xs">&#8984;</span>K
          </kbd>
        </button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* Mobile search button */}
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={onOpenSearch}
          aria-label="Open search"
        >
          <Search className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
