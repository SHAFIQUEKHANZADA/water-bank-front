import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Illinois Farm Water & Energy Pilot",
  description: "Measuring irrigation water and energy, field by field. An independent, evidence-based agricultural research pilot. Phase 1: Mahomet Aquifer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
