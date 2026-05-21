"use client";

import React, { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CopyButtonProps {
  text: string;
  label?: string;
}

export function CopyButton({ text, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(text).catch(() => {
      // Clipboard access can be blocked in embedded browsers.
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
      {copied ? <Check className="h-3.5 w-3.5 text-[var(--forest)]" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied!" : label}
    </Button>
  );
}
