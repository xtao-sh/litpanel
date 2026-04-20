"use client";

import React, { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { CommandSearch } from "@/components/search/command-search";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg">
        Skip to main content
      </a>
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,color-mix(in_oklch,oklch(var(--foreground))_4%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,oklch(var(--foreground))_4%,transparent)_1px,transparent_1px)] bg-[size:96px_96px] opacity-[0.18] [mask-image:linear-gradient(to_bottom,white,transparent_78%)]" />
      <Sidebar />
      <div className="relative lg:pl-72">
        <Header onOpenSearch={() => setSearchOpen(true)} />
        <main id="main-content" className="relative px-4 py-5 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[1540px]">{children}</div>
        </main>
      </div>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
