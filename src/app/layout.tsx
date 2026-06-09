import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SiteDoc AI",
  description:
    "AI-powered website QA reports for accessibility, SEO, performance, and UX issues.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
