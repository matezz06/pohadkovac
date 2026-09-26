import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pohádkovač", description: "Personalizované pohádky s ilustracemi" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
