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
      <p className="text-sm font-medium text-gray-500">Example questions</p>
      <div className="grid gap-2">
        {EXAMPLES.map(({ question, icon: Icon }) => (
          <Card
            key={question}
            className="cursor-pointer rounded-xl border p-3 text-sm text-gray-700 transition-all duration-200 hover:border-primary/50 hover:bg-blue-50/50 hover:shadow-sm hover:text-blue-700"
            onClick={() => onSelect(question)}
          >
            <div className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <span>{question}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
