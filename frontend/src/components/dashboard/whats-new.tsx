"use client";

import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, FileText, ArrowRight, Newspaper } from "lucide-react";
import { GET_WHATS_NEW } from "@/lib/queries";
import type { WhatsNew } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";

function fieldBadgeClass(field: string): string {
  const colors = [
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[var(--forest-soft)] text-[var(--forest-2)]",
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[#f4ead8] text-[#654814]",
    "bg-[#f4dfd5] text-[#742b14]",
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[var(--forest-soft)] text-[var(--forest-2)]",
  ];
  let hash = 0;
  for (let i = 0; i < field.length; i++) {
    hash = (hash * 31 + field.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

export function WhatsNewCard() {
  const { t } = useI18n();
  const { data, loading } = useQuery<{ whatsNew: WhatsNew }>(GET_WHATS_NEW, {
    variables: { limit: 8 },
  });

  const whatsNew = data?.whatsNew;

  if (loading) {
    return (
      <Card className="lp-card relative overflow-hidden">
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
      <Card className="lp-card rounded-[var(--r-md)] border-[var(--line-soft)] shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Newspaper className="h-4 w-4 text-[var(--forest)]" /> {t("dashboard.whatsNew.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <FileText className="h-8 w-8 text-[var(--ink-4)]/40 mb-2" />
            <p className="text-sm text-[var(--ink-4)]">{t("dashboard.whatsNew.empty")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lp-card relative overflow-hidden">
      <CardHeader className="relative pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
            <Sparkles className="h-4.5 w-4.5 text-[var(--forest)]" />
            {t("dashboard.whatsNew.title")}
          </CardTitle>
          <span className="text-xs text-[var(--ink-4)] tabular-nums">
            {t("dashboard.whatsNew.totalPapers", { count: whatsNew.totalPapers.toLocaleString() })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-0.5">
        {whatsNew.latestPapers.map((paper) => (
          <Link
            key={paper.paperId}
            href={`/paper/${paper.paperId}`}
            className="group flex items-start gap-3 rounded-[var(--r)] border border-transparent px-2.5 py-2.5 transition-colors hover:border-[var(--line-soft)] hover:bg-[var(--paper-2)]"
          >
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--forest)] group-hover:text-[var(--forest)]" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium text-[var(--ink)] group-hover:text-[var(--forest)]">
                {paper.title || paper.paperId}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-[var(--paper-2)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--ink-4)]">
                  {paper.paperId.length > 10 ? paper.paperId.slice(0, 10) : paper.paperId}
                </span>
                {paper.year && (
                  <span className="text-[11px] tabular-nums text-[var(--ink-4)]">
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
                  <span className="text-[10px] text-[var(--ink-4)]">
                    +{paper.fields.length - 2}
                  </span>
                )}
                {paper.hasCard && (
                  <span className="ml-auto text-[10px] font-medium text-[var(--forest)]">
                    {t("dashboard.whatsNew.deepRead")}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}

        {/* Footer link */}
        <div className="mt-1 flex items-center justify-between border-t border-[var(--line-soft)] pt-2">
          {whatsNew.recentIdeasCount > 0 && (
            <Link
              href="/ideas"
              className="text-xs text-[var(--ink-4)] hover:text-[var(--forest)] transition-colors"
            >
              {t("dashboard.whatsNew.newIdeasThisMonth", { count: whatsNew.recentIdeasCount })}
            </Link>
          )}
          <Link
            href="/latest"
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--forest)] transition-colors hover:text-[var(--forest)]/80"
          >
            {t("dashboard.actions.openLatestResearch")}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
