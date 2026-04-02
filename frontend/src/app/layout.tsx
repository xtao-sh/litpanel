import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "katex/dist/katex.min.css";
import "./globals.css";
import { ApolloWrapper } from "@/lib/apollo-provider";
import { AppShell } from "@/components/layout/app-shell";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

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
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ApolloWrapper>
            <AppShell>{children}</AppShell>
          </ApolloWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
