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
  // karty 2×, strany 2× (vlna úprav), pozadí míst (max 4), rezerva 25 % na automatické překreslení po kontrole
  const images = pkg.maxCharacters * 2 + (pkg.pages + 1) * 2 + 4 + Math.ceil((pkg.pages + 1) * 0.25);
  const textUsd = 0.08; // popisy, příběh, přepisy textů – řádově centy
  return (images * img + textUsd) * USD_CZK;
}

// ---------- Odhad pro rodiče (průběžně na obrazovce) ----------
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
/** Průměrně ~30 % obrázků se po AI kontrole kreslí znovu. */
const REDRAW = 1.3;
/** Texty: příběh, popisy postav, kontroly, překlady – v USD na celou knížku. */
const TEXT_USD = 0.06;

/** Cena jednoho obrázku v Kč (včetně průměrného překreslení po kontrole). */
export function imageCzk(model = DEFAULT_IMAGE_MODEL) {
  return priceOf(model).perImage * REDRAW * USD_CZK;
}

/** Kolik pozadí (míst) čekat podle volby počtu míst. */
export function platesFor(placeCount?: string) {
  return placeCount === "1" ? 1 : placeCount === "4-5" ? 5 : 3;
}

/** Víc míst = víc ladění prostředí a překreslování stran – rezerva na opravy. */
function pagesFactor(placeCount?: string) {
  return placeCount === "4-5" ? 1.15 : placeCount === "1" ? 0.95 : 1;
}

/** První odhad z formuláře: počet postav, stran a míst. */
export function estimateCzk(characters: number, pages: number, placeCount?: string, model = DEFAULT_IMAGE_MODEL) {
  const images = characters + platesFor(placeCount) + (pages + 1) * pagesFactor(placeCount);
  return images * imageCzk(model) + TEXT_USD * USD_CZK;
}

type BookLike = {
  characters: { sheet?: string }[];
  pages: { n: number; image?: string; stale?: boolean }[];
  pageCount: number;
  placeCount?: string;
  locations?: { plate?: string }[];
};

/** Kolik ještě zbývá utratit do hotové knížky (chybějící karty, pozadí, strany a zastaralé strany). */
export function remainingCzk(b: BookLike, isMissing: (f?: string) => boolean = (f) => !f) {
  const one = imageCzk();
  let images = b.characters.filter((c) => isMissing(c.sheet)).length;
  let text = 0;
  if (!b.pages.length) {
    images += (b.pageCount + 1) * pagesFactor(b.placeCount) + platesFor(b.placeCount);
    text = TEXT_USD * USD_CZK;
  } else {
    images += (b.locations ?? []).filter((l) => isMissing(l.plate)).length;
    images += b.pages.filter((p) => isMissing(p.image) || p.stale).length;
  }
  return images * one + text;
}

export const formatCzk = (v: number) => `${v < 10 ? v.toFixed(1).replace(".", ",") : Math.round(v)} Kč`;
