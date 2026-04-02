"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Atom, Lightbulb, Search, ArrowUpRight } from "lucide-react";
import type { Stats } from "@/lib/types";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

interface StatsCardsProps {
  stats: Stats | undefined;
  loading: boolean;
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
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
        <Card className="relative overflow-hidden rounded-xl border-l-4 border-l-blue-500 shadow-sm transition-all duration-200 hover:shadow-md h-full">
          <div className="absolute inset-0 bg-blue-50/30" />
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Papers
            </CardTitle>
            <div className="flex items-center gap-1">
              <FileText className="h-4 w-4 text-blue-500" />
              <ArrowUpRight className="h-3 w-3 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold tracking-tight text-foreground">
              {formatNumber(stats.totalPapers)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              All indexed papers · {formatNumber(stats.totalCards)} with deep-read cards
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* Knowledge Atoms */}
      <Link href="/explorer?tab=atoms" className="cursor-pointer">
        <Card className="relative overflow-hidden rounded-xl border-l-4 border-l-emerald-500 shadow-sm transition-all duration-200 hover:shadow-md h-full">
          <div className="absolute inset-0 bg-emerald-50/30" />
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Knowledge Atoms
            </CardTitle>
            <div className="flex items-center gap-1">
              <Atom className="h-4 w-4 text-emerald-500" />
              <ArrowUpRight className="h-3 w-3 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold tracking-tight text-foreground">
              {formatNumber(stats.totalAtoms)}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Extracted knowledge objects across the corpus.{" "}
              {formatNumber(stats.totalMechanisms)} mechanisms &middot;{" "}
              {formatNumber(stats.totalMethods)} methods &middot;{" "}
              {formatNumber(stats.totalDatasets)} datasets &middot;{" "}
              {formatNumber(stats.totalPuzzles)} puzzles
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* Research Ideas */}
      <Link href="/ideas" className="cursor-pointer">
        <Card className="relative overflow-hidden rounded-xl border-l-4 border-l-amber-500 shadow-sm transition-all duration-200 hover:shadow-md h-full">
          <div className="absolute inset-0 bg-amber-50/30" />
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Research Ideas
            </CardTitle>
            <div className="flex items-center gap-1">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <ArrowUpRight className="h-3 w-3 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold tracking-tight text-foreground">
              {formatNumber(stats.totalIdeas)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              AI-generated hypotheses from maps and gap synthesis
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* Search */}
      <Link href="/explorer">
        <Card className="relative overflow-hidden rounded-xl border-l-4 border-l-violet-500 shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md h-full">
          <div className="absolute inset-0 bg-violet-50/30" />
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Search
            </CardTitle>
            <div className="flex items-center gap-1">
              <Search className="h-4 w-4 text-violet-500" />
              <ArrowUpRight className="h-3 w-3 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold tracking-tight text-foreground">
              Explore
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Search papers, atoms & ideas
            </p>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
