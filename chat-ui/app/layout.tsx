import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCP Chat",
  description: "ChatGPT-style UI over the MCP servers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
