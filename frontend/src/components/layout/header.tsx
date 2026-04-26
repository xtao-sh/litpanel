"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Moon, Sun, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/lib/app-config";
import { useI18n } from "@/lib/i18n/locale-context";
import { useTheme } from "@/lib/theme-context";

const pageTitles: Record<string, string> = {
  "/": "header.titles.dashboard",
  "/latest": "header.titles.latest",
  "/explorer": "header.titles.explorer",
  "/graph": "header.titles.graph",
  "/maps": "header.titles.maps",
  "/projects": "header.titles.projects",
  "/ideas": "header.titles.ideas",
  "/ask": "header.titles.ask",
  "/digests": "header.titles.digests",
  "/library": "header.titles.library",
  "/research": "header.titles.research",
  "/setup": "header.titles.setup",
  "/china": "header.titles.china",
  "/pipeline": "header.titles.pipeline",
  "/compare": "header.titles.compare",
  "/ideas/workspace": "header.titles.workspace",
  "/methods": "header.titles.methods",
  "/fields": "header.titles.fields",
  "/jel": "header.titles.jel",
};

const pageDescriptions: Record<string, string> = {
  "/": "header.descriptions.dashboard",
  "/latest": "header.descriptions.latest",
  "/research": "header.descriptions.research",
  "/setup": "header.descriptions.setup",
  "/explorer": "header.descriptions.explorer",
  "/projects": "header.descriptions.projects",
  "/graph": "header.descriptions.graph",
};

function getPageTitle(pathname: string, t: (key: string) => string): string {
  if (pageTitles[pathname]) return t(pageTitles[pathname]);
  if (pathname.startsWith("/paper/")) return t("header.titles.paperDetail");
  if (pathname.startsWith("/atom/")) return t("header.titles.atomDetail");
  if (pathname.startsWith("/maps/")) return t("header.titles.fieldMap");
  if (pathname.startsWith("/projects/")) {
    if (pathname.endsWith("/dossier")) return t("header.titles.projectDossier");
    if (pathname.endsWith("/chronology")) return t("header.titles.projectChronology");
    if (pathname.endsWith("/themes")) return t("header.titles.projectThemes");
    if (pathname.endsWith("/methods")) return t("header.titles.projectMethods");
    if (pathname.endsWith("/gaps")) return t("header.titles.projectGaps");
    if (pathname.endsWith("/matrix")) return t("header.titles.projectMatrix");
    return t("header.titles.projectOverview");
  }
  return appConfig.appName;
}

function getPageDescription(pathname: string, t: (key: string) => string): string {
  if (pageDescriptions[pathname]) return t(pageDescriptions[pathname]);
  if (pathname.startsWith("/projects/")) return t("header.descriptions.projectDefault");
  if (pathname.startsWith("/paper/")) return t("header.descriptions.paperDefault");
  if (pathname.startsWith("/atom/")) return t("header.descriptions.atomDefault");
  return t("header.descriptions.fallback");
}

interface Breadcrumb {
  parentHref: string;
  parentLabel: string;
  currentLabel: string;
}

function getBreadcrumb(pathname: string, t: (key: string) => string): Breadcrumb | null {
  if (pathname.startsWith("/paper/")) {
    return {
      parentHref: "/explorer",
      parentLabel: t("header.titles.explorer"),
      currentLabel: t("header.titles.paperDetail"),
    };
  }
  if (pathname.startsWith("/atom/")) {
    return {
      parentHref: "/explorer",
      parentLabel: t("header.titles.explorer"),
      currentLabel: t("header.titles.atomDetail"),
    };
  }
  if (pathname.startsWith("/projects/") && pathname !== "/projects") {
    const title = getPageTitle(pathname, t);
    return { parentHref: "/projects", parentLabel: t("header.titles.projects"), currentLabel: title };
  }
  if (pathname.startsWith("/maps/") && pathname !== "/maps") {
    return { parentHref: "/maps", parentLabel: t("header.titles.maps"), currentLabel: t("header.titles.fieldMap") };
  }
  return null;
}

interface HeaderProps {
  onOpenSearch: () => void;
}

export function Header({ onOpenSearch }: HeaderProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const title = getPageTitle(pathname, t);
  const breadcrumb = getBreadcrumb(pathname, t);
  const description = getPageDescription(pathname, t);

  return (
    <header className="sticky top-0 z-30 border-b border-[color:color-mix(in_oklch,oklch(var(--foreground))_8%,transparent)] bg-[color:oklch(var(--background)/0.86)] backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-[1540px] items-center justify-between px-4 lg:px-8">
        <div className="pl-10 lg:pl-0">
          <h1 className="font-display text-[1.45rem] text-foreground">{title}</h1>
          <p className="hidden text-sm text-muted-foreground lg:block">{description}</p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-0.5 text-muted-foreground hover:text-foreground lg:hidden"
            title={description}
            aria-label={t("header.pageDescription")}
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
          <div
            className="hidden items-center rounded-full border border-[color:color-mix(in_oklch,oklch(var(--foreground))_8%,transparent)] bg-[color:oklch(var(--card)/0.86)] p-1 lg:flex"
            aria-label={t("common.language.label")}
          >
            <button
              type="button"
              onClick={() => setLocale("en")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${locale === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t("common.language.english")}
            </button>
            <button
              type="button"
              onClick={() => setLocale("zh-CN")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${locale === "zh-CN" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t("common.language.chinese")}
            </button>
          </div>

          <button
            className="hidden items-center gap-2 rounded-full border border-[color:color-mix(in_oklch,oklch(var(--foreground))_8%,transparent)] bg-[color:oklch(var(--card)/0.86)] px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-[color:oklch(var(--accent)/0.52)] hover:text-foreground lg:flex"
            onClick={onOpenSearch}
          >
            <Search className="h-4 w-4" />
            <span className="xl:hidden">{t("header.searchShort")}</span>
            <span className="hidden xl:inline">{t("header.searchLong")}</span>
            <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center gap-0.5 rounded-full border border-border bg-background px-1.5 font-mono text-xs font-medium text-muted-foreground">
              <span className="text-xs">&#8984;</span>K
            </kbd>
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full border border-transparent hover:border-border"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={t("header.toggleTheme")}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="rounded-full sm:hidden"
            onClick={onOpenSearch}
            aria-label={t("header.openSearch")}
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
