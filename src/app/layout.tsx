import type { Metadata } from "next";
import { Baloo_2, JetBrains_Mono, Nunito } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/i18n/provider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { THEME_INIT_SCRIPT } from "@/components/theme/theme-script";

// Display: chunky rounded poster type for headlines and numerals.
const baloo = Baloo_2({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-baloo",
  weight: ["600", "700", "800"],
  display: "swap",
});

// Body: humanist and rounded, legible down to the 11px report labels.
const nunito = Nunito({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-nunito",
  display: "swap",
});

// Mono: CSS selectors and the AI fix prompt.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jbmono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SiteDoc AI — Website QA & UX Audit",
  description:
    "AI-powered website QA reports for accessibility, SEO, performance, and UX issues.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${baloo.variable} ${nunito.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Stamps data-theme before first paint so the cream sheet never
            flashes ahead of the dark one (and vice versa). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <div className="paper-texture" aria-hidden />
        <ThemeProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
