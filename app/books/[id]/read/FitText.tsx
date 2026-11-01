"use client";
import { useEffect } from "react";

/** Pojistka: když se text na stránku nevejde, zmenší písmo (max o 30 %). Velikost je v cqw, takže platí i pro tisk. */
export default function FitText() {
  useEffect(() => {
    const fit = () => {
      document.querySelectorAll<HTMLElement>(".sheet .text").forEach((box) => {
        const p = box.querySelector("p");
        if (!p) return;
        p.style.fontSize = "";
        if (getComputedStyle(box.parentElement!).gridTemplateColumns.split(" ").length < 2) return; // mobil: text pod obrázkem
        let size = 2.3;
        const pad = parseFloat(getComputedStyle(box).paddingTop) * 2;
        while (p.scrollHeight > box.clientHeight - pad && size > 1.6) {
          size -= 0.05;
          p.style.fontSize = `${size.toFixed(2)}cqw`;
        }
      });
    };
    fit();
    document.fonts?.ready.then(fit);
    window.addEventListener("resize", fit);
    window.addEventListener("beforeprint", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("beforeprint", fit);
    };
  }, []);
  return null;
}
