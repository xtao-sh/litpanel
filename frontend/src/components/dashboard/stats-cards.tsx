"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Atom, Lightbulb, Layers, ArrowUpRight } from "lucide-react";
import type { Stats } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

interface StatsCardsProps {
  stats: Stats | undefined;
  loading: boolean;
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
  const { t } = useI18n();

  if (loading || !stats) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="stagger-children grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {/* Papers */}
      <Link href="/explorer" className="cursor-pointer">
        <Card className="paper-panel relative overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-md h-full">
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("dashboard.stats.papers")}
            </CardTitle>
            <div className="flex items-center gap-1 text-primary">
              <FileText className="h-4 w-4" />
              <ArrowUpRight className="h-3 w-3" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="font-display text-[2.3rem] text-foreground">
              {formatNumber(stats.totalPapers)}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("dashboard.stats.papersBody", { count: formatNumber(stats.totalCards) })}
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* Knowledge Atoms */}
      <Link href="/explorer?tab=atoms" className="cursor-pointer">
        <Card className="paper-panel relative overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-md h-full">
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("dashboard.stats.atoms")}
            </CardTitle>
            <div className="flex items-center gap-1 text-emerald-700">
              <Atom className="h-4 w-4" />
              <ArrowUpRight className="h-3 w-3" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="font-display text-[2.3rem] text-foreground">
              {formatNumber(stats.totalAtoms)}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("dashboard.stats.atomsBody", {
                mechanisms: formatNumber(stats.totalMechanisms),
                methods: formatNumber(stats.totalMethods),
                datasets: formatNumber(stats.totalDatasets),
                puzzles: formatNumber(stats.totalPuzzles),
              })}
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* Research Ideas */}
      <Link href="/ideas" className="cursor-pointer">
        <Card className="paper-panel relative overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-md h-full">
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("dashboard.stats.ideas")}
            </CardTitle>
            <div className="flex items-center gap-1 text-amber-700">
              <Lightbulb className="h-4 w-4" />
              <ArrowUpRight className="h-3 w-3" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="font-display text-[2.3rem] text-foreground">
              {formatNumber(stats.totalIdeas)}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("dashboard.stats.ideasBody")}
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* Fields */}
      <Link href="/fields" className="cursor-pointer">
        <Card className="paper-panel relative overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-md h-full">
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("dashboard.stats.fields")}
            </CardTitle>
            <div className="flex items-center gap-1 text-violet-700">
              <Layers className="h-4 w-4" />
              <ArrowUpRight className="h-3 w-3" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="font-display text-[2.3rem] text-foreground">
              {formatNumber((stats as Stats & { totalFields?: number }).totalFields ?? 0)}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("dashboard.stats.fieldsBody")}
            </p>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
