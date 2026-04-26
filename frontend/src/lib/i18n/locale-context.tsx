"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "./messages/en";
import zhCN from "./messages/zh-CN";

export type Locale = "en" | "zh-CN";

const STORAGE_KEY = "ui-locale";

type MessageTree = Readonly<Record<string, unknown>>;

const messages: Record<Locale, MessageTree> = {
  en,
  "zh-CN": zhCN,
};

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh-CN") return stored;
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function lookupMessage(tree: MessageTree, key: string): string | null {
  const value = key.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return null;
  }, tree);
  return typeof value === "string" ? value : null;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(.*?)\}\}/g, (_, rawKey) => {
    const key = String(rawKey).trim();
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setLocaleState(detectInitialLocale());
      setHasInitialized(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hasInitialized) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, locale);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [hasInitialized, locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    setHasInitialized(true);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const activeTree = messages[locale];
      const fallback = lookupMessage(messages.en, key) ?? key;
      const translated = lookupMessage(activeTree, key) ?? fallback;
      return interpolate(translated, vars);
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useI18n must be used within a LocaleProvider");
  }
  return context;
}
