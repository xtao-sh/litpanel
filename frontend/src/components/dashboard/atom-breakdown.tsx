"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Cog, FlaskConical, Database, HelpCircle } from "lucide-react";
import type { Stats } from "@/lib/types";

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
    label: "Mechanisms",
    icon: Cog,
    color: "text-orange-500",
    bg: "bg-orange-50",
  },
  {
    key: "totalMethods" as const,
    label: "Methods",
    icon: FlaskConical,
    color: "text-green-500",
    bg: "bg-green-50",
  },
  {
    key: "totalDatasets" as const,
    label: "Datasets",
    icon: Database,
    color: "text-purple-500",
    bg: "bg-purple-50",
  },
  {
    key: "totalPuzzles" as const,
    label: "Puzzles",
    icon: HelpCircle,
    color: "text-red-500",
    bg: "bg-red-50",
  },
];

export function AtomBreakdown({ stats, loading }: AtomBreakdownProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          Atom Type Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {atomTypes.map((at) => (
            <div
              key={at.key}
              className={`flex flex-col items-center justify-center rounded-lg ${at.bg} p-4`}
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
                  <span className="text-xl font-bold text-gray-900">
                    {formatNumber(stats[at.key])}
                  </span>
                  <span className="text-xs text-gray-500 mt-0.5">
                    {at.label}
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
