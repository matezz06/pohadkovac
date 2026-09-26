import "./globals.css";
import type { Metadata } from "next";
import { isMock } from "@/lib/gemini";

export const metadata: Metadata = { title: "Pohádkovač", description: "Personalizované pohádky s ilustracemi" };

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>
        {isMock() && (
          <div className="mock-banner">TESTOVACÍ REŽIM: nevolá se AI, obrázky i text jsou jen zástupné. Naostro spusť „npm run dev“.</div>
        )}
        {children}
      </body>
    </html>
  );
}
