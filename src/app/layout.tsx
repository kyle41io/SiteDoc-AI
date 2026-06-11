import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <div className="aurora-bg" aria-hidden />
        {children}
      </body>
    </html>
  );
}
