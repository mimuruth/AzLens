import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Claude's UI font (Styrene) is proprietary; Inter is the closest free match.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AzLens Chat",
  description: "A modern chat UI over the MCP servers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
