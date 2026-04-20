"use client";

import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, FileText, ArrowRight, Newspaper } from "lucide-react";
import { GET_WHATS_NEW } from "@/lib/queries";
import type { WhatsNew } from "@/lib/types";

function fieldBadgeClass(field: string): string {
  const colors = [
    "bg-blue-100 text-blue-800",
    "bg-emerald-100 text-emerald-800",
    "bg-purple-100 text-purple-800",
    "bg-amber-100 text-amber-800",
    "bg-rose-100 text-rose-800",
    "bg-cyan-100 text-cyan-800",
    "bg-indigo-100 text-indigo-800",
    "bg-teal-100 text-teal-800",
  ];
  let hash = 0;
  for (let i = 0; i < field.length; i++) {
    hash = (hash * 31 + field.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

export function WhatsNewCard() {
  const { data, loading } = useQuery<{ whatsNew: WhatsNew }>(GET_WHATS_NEW, {
    variables: { limit: 8 },
  });

  const whatsNew = data?.whatsNew;

  if (loading) {
    return (
      <Card className="paper-panel relative overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-56" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!whatsNew || whatsNew.latestPapers.length === 0) {
    return (
      <Card className="paper-panel rounded-[1.5rem] border-border/75 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Newspaper className="h-4 w-4 text-primary" /> Latest in the Knowledge Base
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No papers added yet. Run the pipeline to populate.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="paper-panel relative overflow-hidden">
      <CardHeader className="relative pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
            Latest in the Knowledge Base
          </CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {whatsNew.totalPapers.toLocaleString()} papers total
          </span>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-0.5">
        {whatsNew.latestPapers.map((paper) => (
          <Link
            key={paper.paperId}
            href={`/paper/${paper.paperId}`}
            className="group flex items-start gap-3 rounded-2xl border border-transparent px-2.5 py-2.5 transition-colors hover:border-border hover:bg-[color:oklch(var(--accent)/0.42)]"
          >
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70 group-hover:text-primary" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium text-foreground group-hover:text-primary">
                {paper.title || paper.paperId}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {paper.paperId.length > 10 ? paper.paperId.slice(0, 10) : paper.paperId}
                </span>
                {paper.year && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {paper.year}
                  </span>
                )}
                {paper.fields.slice(0, 2).map((f) => (
                  <span
                    key={f}
                    title={f}
                    className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium ${fieldBadgeClass(f)}`}
                  >
                    {f.length > 16 ? f.slice(0, 14) + ".." : f}
                  </span>
                ))}
                {paper.fields.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{paper.fields.length - 2}
                  </span>
                )}
                {paper.hasCard && (
                  <span className="ml-auto text-[10px] font-medium text-primary">
                    deep-read
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}

        {/* Footer link */}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
          {whatsNew.recentIdeasCount > 0 && (
            <Link
              href="/ideas"
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              {whatsNew.recentIdeasCount} new idea{whatsNew.recentIdeasCount !== 1 ? "s" : ""} this month
            </Link>
          )}
          <Link
            href="/latest"
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            Open Latest Research
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
