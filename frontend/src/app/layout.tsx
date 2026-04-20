import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "katex/dist/katex.min.css";
import "./globals.css";
import { ApolloWrapper } from "@/lib/apollo-provider";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "NBER Research Knowledge Base",
  description:
    "Explore NBER working papers, mechanisms, methods, datasets, and research ideas",
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
      suppressHydrationWarning
    >
      <body className="min-h-full font-body">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ApolloWrapper>
            <AppShell>{children}</AppShell>
          </ApolloWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
