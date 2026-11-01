/**
 * Anglická zadání pro Gemini (vzhled, oblečení, scény, prostředí) ukazujeme v aplikaci česky.
 * Překlad je uložen v book.cs spolu s anglickým textem, ze kterého vznikl – když AI anglický text změní,
 * český překlad je zastaralý a vytvoří se znovu. Úprava české verze se přeloží zpět do angličtiny.
 */
import type { Book } from "./types";

export type CsKey = string;

/** Všechna anglická pole, která má smysl ukazovat česky. */
export function csFields(book: Book): { key: CsKey; en: string }[] {
  const out: { key: CsKey; en: string }[] = [];
  for (const c of book.characters) {
    if (c.visual && !c.visual.startsWith("(mock)")) out.push({ key: `c:${c.id}:visual`, en: c.visual });
    if (c.outfit && !c.outfit.startsWith("(mock)")) out.push({ key: `c:${c.id}:outfit`, en: c.outfit });
  }
  for (const p of book.pages) if (p.scene) out.push({ key: `p:${p.n}:scene`, en: p.scene });
  for (const l of book.locations ?? []) if (l.description) out.push({ key: `l:${l.id}:description`, en: l.description });
  if (book.atmosphere) out.push({ key: "atmosphere", en: book.atmosphere });
  return out;
}

export function getEn(book: Book, key: CsKey): string | undefined {
  const [t, id, field] = key.split(":");
  if (key === "atmosphere") return book.atmosphere;
  if (t === "c") {
    const c = book.characters.find((x) => x.id === id);
    return field === "visual" ? c?.visual : field === "outfit" ? c?.outfit : undefined;
  }
  if (t === "p") return book.pages.find((x) => x.n === Number(id))?.scene;
  if (t === "l") return book.locations?.find((x) => x.id === id)?.description;
  return undefined;
}

/** Nastaví anglický text pole. Vrací false, když pole neexistuje. */
export function setEn(book: Book, key: CsKey, value: string): boolean {
  const [t, id, field] = key.split(":");
  if (key === "atmosphere") return (book.atmosphere = value), true;
  if (t === "c") {
    const c = book.characters.find((x) => x.id === id);
    if (!c) return false;
    if (field === "visual") c.visual = value;
    else if (field === "outfit") c.outfit = value;
    else return false;
    return true;
  }
  if (t === "p") {
    const p = book.pages.find((x) => x.n === Number(id));
    if (!p) return false;
    p.scene = value;
    return true;
  }
  if (t === "l") {
    const l = book.locations?.find((x) => x.id === id);
    if (!l) return false;
    l.description = value;
    l.plate = undefined; // jiný popis = staré pozadí neplatí
    return true;
  }
  return false;
}

/** Aktuální český překlad, nebo undefined, když chybí / je zastaralý. */
export function csText(book: Book, key: CsKey): string | undefined {
  const en = getEn(book, key);
  const t = book.cs?.[key];
  return en && t && t.en === en ? t.cs : undefined;
}

/** Pole, kterým chybí aktuální český překlad. */
export function missingCs(book: Book) {
  return csFields(book).filter((f) => book.cs?.[f.key]?.en !== f.en);
}
