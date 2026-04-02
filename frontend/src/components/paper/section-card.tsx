"use client";

import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionContent } from "@/components/paper/section-content";
import { stripLatex } from "@/lib/render-latex";

interface SectionCardProps {
  title: string;
  content: string;
  defaultExpanded?: boolean;
}

/** Pretty-print a section title from its snake_case key. */
function formatSectionTitle(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Section type -> left border color. */
function sectionBorderColor(title: string): string {
  switch (title) {
    case "research_question":
      return "border-l-blue-500";
    case "identification_and_method":
      return "border-l-green-500";
    case "key_findings":
      return "border-l-amber-500";
    case "what_makes_this_paper_good":
      return "border-l-purple-500";
    case "limitations_and_open_questions":
      return "border-l-red-400";
    case "china_applicability":
      return "border-l-rose-500";
    default:
      return "border-l-gray-300";
  }
}

export function SectionCard({
  title,
  content,
  defaultExpanded = false,
}: SectionCardProps) {
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
    <Card className={`border-gray-200 border-l-[3px] shadow-none ${sectionBorderColor(title)}`}>
      <CardHeader
        className="flex cursor-pointer flex-row items-center gap-2 p-4 select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`}
        />
        <h3 className="text-sm font-semibold text-gray-900">
          {formatSectionTitle(title)}
        </h3>
      </CardHeader>

      {!expanded && preview && (
        <CardContent className="px-4 pb-4 pt-0">
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {preview}{preview.length >= 160 ? "..." : ""}
          </p>
        </CardContent>
      )}

      {expanded && (
        <CardContent className="px-4 pb-4 pt-0">
          <SectionContent content={content} />
        </CardContent>
      )}
    </Card>
  );
}
