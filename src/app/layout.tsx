import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import "./globals.css";

// Autrey Mill's website sets its headings in Oswald. next/font self-hosts the
// files, so no request reaches Google and the CSP font-src stays 'self'.
const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Autrey Mill Information Assistant",
  description:
    "A grounded information assistant prototype using approved information from Autrey Mill Nature Preserve & Heritage Center.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={oswald.variable}>
      <body>{children}</body>
    </html>
  );
}
