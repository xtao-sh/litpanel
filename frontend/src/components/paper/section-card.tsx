"use client";

import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { SectionContent } from "@/components/paper/section-content";
import { stripLatex } from "@/lib/render-latex";
import { useI18n } from "@/lib/i18n/locale-context";

interface SectionCardProps {
  title: string;
  content: string;
  defaultExpanded?: boolean;
}

/** Pretty-print a section title from its snake_case key. */
function formatSectionTitle(raw: string, isZh: boolean): string {
  const normalized = raw.trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, "_");
  const labelsZh: Record<string, string> = {
    research_question: "研究问题",
    identification_and_method: "识别与方法",
    key_findings: "关键发现",
    what_makes_this_paper_good: "论文价值",
    limitations_and_open_questions: "局限与开放问题",
    china_applicability: "中国适用性",
  };
  const labelsEn: Record<string, string> = {
    research_question: "Research question",
    identification_and_method: "Identification and method",
    key_findings: "Key findings",
    what_makes_this_paper_good: "Why this paper matters",
    limitations_and_open_questions: "Limitations and open questions",
    china_applicability: "China applicability",
  };
  const labels = isZh ? labelsZh : labelsEn;
  if (labels[raw]) return labels[raw];
  if (labels[normalized]) return labels[normalized];
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SectionCard({
  title,
  content,
  defaultExpanded = false,
}: SectionCardProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [expanded, setExpanded] = useState(defaultExpanded);

  const preview = useMemo(() => {
    if (!content) return "";
    const lines = content.split("\n").filter((l) => l.trim());
    const raw = lines.slice(0, 2).join(" ").slice(0, 160);
    // Strip markdown markers and LaTeX delimiters for plain-text preview
    const noMd = raw.replace(/\*\*([^*]+?)\*\*/g, "$1").replace(/\*([^*]+?)\*/g, "$1");
    return stripLatex(noMd);
  }, [content]);

  return (
    <section className="lit-section-card">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 text-left select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--ink-4)] transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`}
        />
        <h3 className="lit-section-title">
          {formatSectionTitle(title, isZh)}
        </h3>
      </button>

      {!expanded && preview && (
        <div className="mt-3 pl-6">
          <p className="line-clamp-2 font-display text-[1.02rem] leading-relaxed text-[var(--ink-4)]">
            {preview}{preview.length >= 160 ? "..." : ""}
          </p>
        </div>
      )}

      {expanded && (
        <div className="mt-4 pl-6">
          <SectionContent content={content} />
        </div>
      )}
    </section>
  );
}
