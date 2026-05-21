"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Search, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/locale-context";
import { useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/library", label: "Library", match: ["/library"] },
  { href: "/latest", label: "Paper", match: ["/latest", "/paper"] },
  { href: "/graph", label: "Graph", match: ["/graph"] },
  { href: "/explorer", label: "Atlas", match: ["/explorer", "/atom", "/fields", "/jel", "/methods"] },
  { href: "/setup", label: "Brand", match: ["/setup"] },
];

function formatHeaderDate(locale: "en" | "zh-CN") {
  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

function isActive(pathname: string, item: (typeof navItems)[number]) {
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

interface HeaderProps {
  onOpenSearch: () => void;
}

export function Header({ onOpenSearch }: HeaderProps) {
  const pathname = usePathname();
  const { toggleTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();

  return (
    <header className="lp-nav">
      <div className="lp-nav-inner">
        <Link href="/" className="lp-brand" aria-label="Lit Panel">
          <span className="lp-brand-mark" aria-hidden="true">
            <span className="lp-brand-axis" />
            <span className="lp-brand-bar lp-brand-bar-a" />
            <span className="lp-brand-bar lp-brand-bar-b" />
            <span className="lp-brand-bar lp-brand-bar-c" />
            <span className="lp-brand-dot" />
          </span>
          <span className="lp-brand-word">
            Lit <em>Panel</em>
          </span>
        </Link>
        <span className="lp-brand-date">{formatHeaderDate(locale)}</span>

        <nav className="lp-nav-links" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("lp-nav-link", isActive(pathname, item) && "is-active")}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="lp-nav-right">
          <button
            type="button"
            className="lp-search-trigger"
            onClick={onOpenSearch}
            aria-label={t("header.openSearch")}
          >
            <Search className="h-4 w-4" />
            <span>{locale === "zh-CN" ? "搜索论文、知识点、领域..." : "Search papers, atoms, fields..."}</span>
            <kbd>
              <span>&#8984;</span>K
            </kbd>
          </button>

          <div className="lp-lang" aria-label={t("common.language.label")}>
            <button
              type="button"
              onClick={() => setLocale("en")}
              className={locale === "en" ? "is-active" : undefined}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLocale("zh-CN")}
              className={locale === "zh-CN" ? "is-active" : undefined}
            >
              中文
            </button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="lp-icon-btn h-9 w-9"
            onClick={toggleTheme}
            aria-label={t("header.toggleTheme")}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
        </div>
      </div>
    </header>
  );
}
