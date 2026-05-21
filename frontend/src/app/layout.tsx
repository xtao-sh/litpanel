import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { ApolloWrapper } from "@/lib/apollo-provider";
import { AppShell } from "@/components/layout/app-shell";
import { appConfig } from "@/lib/app-config";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { ThemeProvider } from "@/lib/theme-context";

export const metadata: Metadata = {
  title: appConfig.appName,
  description: appConfig.appDescription,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="min-h-full font-body">
        <ThemeProvider>
          <LocaleProvider>
            <ApolloWrapper>
              <AppShell>{children}</AppShell>
            </ApolloWrapper>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
