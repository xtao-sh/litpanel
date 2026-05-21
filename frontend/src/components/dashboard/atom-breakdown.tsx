"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Cog, FlaskConical, Database, HelpCircle } from "lucide-react";
import type { Stats } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";

interface AtomBreakdownProps {
  stats: Stats | undefined;
  loading: boolean;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

const atomTypes = [
  {
    key: "totalMechanisms" as const,
    labelKey: "dashboard.atomBreakdown.mechanisms",
    icon: Cog,
    color: "text-[#8a6d3b]",
    bg: "bg-[#f4ead8]",
  },
  {
    key: "totalMethods" as const,
    labelKey: "dashboard.atomBreakdown.methods",
    icon: FlaskConical,
    color: "text-[var(--forest)]",
    bg: "bg-[var(--forest-soft)]",
  },
  {
    key: "totalDatasets" as const,
    labelKey: "dashboard.atomBreakdown.datasets",
    icon: Database,
    color: "text-[#2c4870]",
    bg: "bg-[#e9eef6]",
  },
  {
    key: "totalPuzzles" as const,
    labelKey: "dashboard.atomBreakdown.puzzles",
    icon: HelpCircle,
    color: "text-[var(--rust)]",
    bg: "bg-[#f4dfd5]",
  },
];

export function AtomBreakdown({ stats, loading }: AtomBreakdownProps) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {t("dashboard.atomBreakdown.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {atomTypes.map((at) => (
            <div
              key={at.key}
              className={`flex flex-col items-center justify-center rounded-[var(--r)] ${at.bg} p-4`}
            >
              {loading || !stats ? (
                <>
                  <Skeleton className="h-5 w-5 rounded mb-2" />
                  <Skeleton className="h-6 w-14 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </>
              ) : (
                <>
                  <at.icon className={`h-5 w-5 ${at.color} mb-2`} />
                  <span className="text-xl font-bold text-[var(--ink)]">
                    {formatNumber(stats[at.key])}
                  </span>
                  <span className="text-xs text-[var(--ink-4)] mt-0.5">
                    {t(at.labelKey)}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
