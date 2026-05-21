"use client";

import { ResponsiveRadar } from "@nivo/radar";
import type { PaperScore } from "@/lib/types";

/** Dimension groupings used for the radar chart ordering. */
const DIMENSION_ORDER: string[] = [
  // Literature & Theory
  "literature_innovation",
  "theory_contribution",
  "hypothesis_clarity",
  "theoretical_framework",
  // Methods & Data
  "identification_strategy",
  "robustness",
  "data_quality",
  "statistical_rigor",
  // Writing & Presentation
  "writing_quality",
  "structure_logic",
  "tables_figures",
  "transparency",
  // Relevance
  "policy_relevance",
  "china_applicability",
  "novelty",
];

function shortLabel(dim: string): string {
  const map: Record<string, string> = {
    literature_innovation: "Lit. Innov.",
    theory_contribution: "Theory",
    hypothesis_clarity: "Hypothesis",
    theoretical_framework: "Framework",
    identification_strategy: "ID Strategy",
    robustness: "Robustness",
    data_quality: "Data Qual.",
    statistical_rigor: "Stats Rigor",
    writing_quality: "Writing",
    structure_logic: "Structure",
    tables_figures: "Tables/Fig.",
    transparency: "Transparency",
    policy_relevance: "Policy Rel.",
    china_applicability: "China Appl.",
    novelty: "Novelty",
  };
  return map[dim] ?? dim.replace(/_/g, " ").slice(0, 12);
}

interface ScoreRadarProps {
  scores: PaperScore[];
}

export function ScoreRadar({ scores }: ScoreRadarProps) {
  if (!scores || scores.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--ink-5)]">
        No scores available
      </p>
    );
  }

  const scoreMap = new Map(scores.map((s) => [s.dimension, s.score]));

  // Build data in dimension order, skipping missing ones
  const data = DIMENSION_ORDER.filter((dim) => scoreMap.has(dim)).map(
    (dim) => ({
      dimension: shortLabel(dim),
      score: scoreMap.get(dim)!,
    })
  );

  // Also add any dimensions not in our predefined order
  for (const s of scores) {
    if (!DIMENSION_ORDER.includes(s.dimension)) {
      data.push({ dimension: shortLabel(s.dimension), score: s.score });
    }
  }

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--ink-5)]">
        No scores available
      </p>
    );
  }

  const avg = data.reduce((s, d) => s + d.score, 0) / data.length;

  return (
    <div className="space-y-2">
      <div className="h-72 px-1">
        <ResponsiveRadar
          data={data}
          keys={["score"]}
          indexBy="dimension"
          maxValue={5}
          margin={{ top: 44, right: 64, bottom: 44, left: 64 }}
          curve="linearClosed"
          gridShape="circular"
          gridLevels={5}
          gridLabelOffset={18}
          enableDots={true}
          dotSize={6}
          dotColor={{ theme: "background" }}
          dotBorderWidth={1}
          dotBorderColor={{ from: "color" }}
          colors={["#15803d"]}
          fillOpacity={0.15}
          borderWidth={2}
          borderColor={{ from: "color" }}
          animate={true}
          theme={{
            text: { fontSize: 13, fontFamily: "Inter, system-ui, sans-serif", fill: "#4a463c" },
            axis: {
              ticks: { text: { fontSize: 13, fill: "#4a463c" } },
            },
          }}
        />
      </div>
      <p className="text-center text-sm font-medium text-[var(--ink-4)]">
        Average: <span className="font-semibold text-[var(--ink)]">{avg.toFixed(1)}</span>/5
      </p>
    </div>
  );
}
