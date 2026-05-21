"use client";

import React from "react";
import { HelpCircle, FlaskConical, Swords, Database, Compass } from "lucide-react";
import { Card } from "@/components/ui/card";

const EXAMPLES: { question: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { question: "What methods have been used to identify AI's causal effect on productivity?", icon: HelpCircle },
  { question: "Compare the DID estimators discussed in recent papers", icon: FlaskConical },
  { question: "What are the main debates in health economics?", icon: Swords },
  { question: "Which datasets are available for studying platform competition?", icon: Database },
  { question: "What are the frontier gaps in IO research?", icon: Compass },
];

interface ExampleQuestionsProps {
  onSelect: (question: string) => void;
}

export function ExampleQuestions({ onSelect }: ExampleQuestionsProps) {
  return (
    <div className="space-y-3">
      <p className="section-kicker">Example questions</p>
      <div className="grid gap-2">
        {EXAMPLES.map(({ question, icon: Icon }) => (
          <Card
            key={question}
            className="lp-card cursor-pointer rounded-[var(--r-md)] border border-[var(--line-soft)] p-3 text-sm text-[var(--ink)] transition-all duration-200 hover:bg-[var(--paper-2)] hover:text-[var(--forest)]"
            onClick={() => onSelect(question)}
          >
            <div className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--forest)]/55" />
              <span>{question}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
