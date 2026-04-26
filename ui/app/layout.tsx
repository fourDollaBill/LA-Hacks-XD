import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SupplyMind — Multi-Agent Supply Chain",
  description: "Real-time supply chain optimization using 5 specialized AI agents",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
