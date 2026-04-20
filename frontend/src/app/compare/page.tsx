"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ComparisonTableSkeleton, ComparisonTableView } from "@/components/compare/comparison-table-view";
import { useComparisonResult } from "@/lib/use-comparison-result";

function CompareContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids") || "";
  const source = searchParams.get("source") || "explorer";
  const returnTo = searchParams.get("returnTo") || "/explorer";
  const context = searchParams.get("context") || "";
  const paperIds = useMemo(() => idsParam.split(",").filter(Boolean), [idsParam]);
  const hasEnoughPaperIds = paperIds.length >= 2;
  const sourceLabel =
    source === "research"
      ? "Research"
      : source === "paper"
        ? "Paper Detail"
        : source === "latest"
          ? "Latest Research"
          : "Explorer";
  const backHref = returnTo;
  const backLabel =
    source === "research"
      ? "Back to Research"
      : source === "paper"
        ? "Back to Paper"
        : source === "latest"
          ? "Back to Latest Research"
          : "Back to Explorer";

  const { result, loading, error: requestError } = useComparisonResult(paperIds);
  const error = hasEnoughPaperIds ? requestError : "Select at least 2 papers to compare.";

  if (loading) {
    return <ComparisonTableSkeleton />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href={backHref} className="transition-colors hover:text-foreground">
            {sourceLabel}
          </Link>
          <span>/</span>
          <span className="text-foreground">Compare</span>
        </nav>
        <div className="paper-panel flex flex-col items-center justify-center rounded-[1.8rem] px-6 py-24 text-center">
          <p className="section-kicker">Comparison unavailable</p>
          <h2 className="font-display mt-3 text-[2rem] text-foreground">Cannot compare papers</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{error}</p>
          <Link
            href={backHref}
            className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  if (!result || result.papers.length === 0) {
    return (
      <div className="paper-panel flex flex-col items-center justify-center rounded-[1.8rem] px-6 py-24 text-center">
        <p className="section-kicker">Empty comparison</p>
        <p className="mt-3 text-sm text-muted-foreground">No results to display.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={backHref} className="transition-colors hover:text-foreground">
          {sourceLabel}
        </Link>
        <span>/</span>
        <span className="text-foreground">Compare ({result.papers.length} papers)</span>
      </nav>

      <ComparisonTableView
        result={result}
        paperIds={paperIds}
        title="Paper Comparison"
        subtitle={`Side-by-side comparison of ${result.papers.length} papers`}
        context={context}
      />

      <div className="pt-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/75 bg-background/85 px-4 py-2 text-sm font-medium text-primary hover:bg-accent/50"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<ComparisonTableSkeleton />}>
      <CompareContent />
    </Suspense>
  );
}
