/**
 * ODHAD NÁKLADŮ – ceník Gemini API převedený na Kč.
 * Hodnoty jsou orientační: ověř je v ceníku Google (ai.google.dev/pricing) a porovnej
 * s vyúčtováním v Google Cloud. Pak uprav čísla níže.
 */
import type { UsageEntry } from "./types";
import type { Package } from "./packages";

export const USD_CZK = 23;

type ModelPrice = { inputPerM: number; outputPerM: number; perImage: number };

// USD. Klíč = začátek názvu modelu.
const PRICES: Record<string, ModelPrice> = {
  "gemini-3.1-flash-image": { inputPerM: 0.5, outputPerM: 0, perImage: 0.067 },
  "gemini-3.1-flash-lite-image": { inputPerM: 0.25, outputPerM: 0, perImage: 0.03 },
  "gemini-3-pro-image": { inputPerM: 2, outputPerM: 0, perImage: 0.134 },
  "gemini-2.5-flash-image": { inputPerM: 0.3, outputPerM: 0, perImage: 0.039 },
  "gemini-3.5-flash": { inputPerM: 0.3, outputPerM: 2.5, perImage: 0 },
  mock: { inputPerM: 0, outputPerM: 0, perImage: 0 },
};
const FALLBACK: ModelPrice = { inputPerM: 0.5, outputPerM: 3, perImage: 0.07 };

function priceOf(model: string): ModelPrice {
  const key = Object.keys(PRICES)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICES[key] : FALLBACK;
}

export function entryCostUsd(u: UsageEntry) {
  const p = priceOf(u.model);
  const output = u.images > 0 ? u.images * p.perImage : (u.outputTokens / 1e6) * p.outputPerM;
  return (u.inputTokens / 1e6) * p.inputPerM + output;
}

export function costCzk(usage: UsageEntry[]) {
  return usage.reduce((s, u) => s + entryCostUsd(u), 0) * USD_CZK;
}

/**
 * Nejhorší možný náklad balíčku: karty postav (2× – s komentářem), obálka + strany (2× – vlna úprav),
 * texty a popisy (malé). Slouží ke kontrole, že cena balíčku má dostatečnou rezervu.
 */
export function maxCostCzk(pkg: Package, imageModel = "gemini-3.1-flash-image") {
  const img = priceOf(imageModel).perImage;
  const images = pkg.maxCharacters * 2 + (pkg.pages + 1) * 2;
  const textUsd = 0.05; // popisy, příběh, přepisy textů – řádově centy
  return (images * img + textUsd) * USD_CZK;
}
