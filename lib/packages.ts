import type { TextLength } from "./types";

/**
 * BALÍČKY PRO ZÁKAZNÍKY – cena a pevné limity.
 * Limity hlídá server, takže náklad na knížku má známý strop (viz lib/pricing.ts → maxCostCzk).
 */
export type Package = {
  id: string;
  label: string;
  pages: number;
  textLength: TextLength;
  maxCharacters: number;
  priceCzk: number;
};

export const PACKAGES: Package[] = [
  { id: "mini", label: "Mini – 6 stran, krátké texty", pages: 6, textLength: "short", maxCharacters: 3, priceCzk: 199 },
  { id: "klasik", label: "Klasik – 10 stran, střední texty", pages: 10, textLength: "medium", maxCharacters: 4, priceCzk: 299 },
  { id: "velka", label: "Velká – 15 stran, dlouhé texty na dobrou noc", pages: 15, textLength: "long", maxCharacters: 5, priceCzk: 449 },
];

export const getPackage = (id?: string) => PACKAGES.find((p) => p.id === id);
