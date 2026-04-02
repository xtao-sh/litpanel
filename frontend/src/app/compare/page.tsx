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
        <div className="flex flex-col items-center justify-center py-24">
          <h2 className="text-xl font-semibold text-gray-900">Cannot compare papers</h2>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
          <Link
            href={backHref}
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
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
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-gray-500">No results to display.</p>
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
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
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
