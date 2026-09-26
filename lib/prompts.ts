/**
 * VŠECHNA ZADÁNÍ PRO AI NA JEDNOM MÍSTĚ.
 * Tady se ladí kvalita – uprav text, ulož, vygeneruj znovu.
 */
import type { Book, Character } from "./types";
import { stylePrompt } from "./styles";

// ---------- 1) Vizuální popis postavy z fotek ----------
export function visualDescriptionPrompt(c: Character) {
  return `You are preparing a character for a children's picture book illustrator.
Look at the attached photo(s) of "${c.name}" (${c.role}). Notes from the parent: ${c.description || "none"}.

Write ONE compact English paragraph (max 60 words) describing only the stable visual features an illustrator needs
to keep the character recognizable: species/breed (for animals), approximate age, body build, hair/fur colour and style,
facial hair, glasses, distinctive marks, typical clothing colours. No names, no personality, no background.`;
}

// ---------- 2) Karta postavy (stylizovaná předloha) ----------
export function characterSheetPrompt(book: Book, c: Character) {
  return `Create a single character reference illustration for a children's picture book.
Style: ${stylePrompt(book.styleId, book.customStyle)}.
Subject: ${c.role}. ${c.visual ?? ""}
Use the attached photo(s) ONLY as likeness reference – keep the recognizable features (face shape, hair/fur colours, markings,
glasses, beard…) but redraw fully in the illustration style, friendly and cute, suitable for a ${book.childAge}-year-old.
Full body, front three-quarter view, neutral pose, gentle smile, plain very light background, no text, no other characters.`;
}

// ---------- 3) Příběh ----------
export const STORY_SYSTEM = `Jsi zkušená autorka českých pohádek pro malé děti. Píšeš přirozenou, hezkou češtinou
(správné skloňování jmen, 5. pád při oslovení), krátkými větami, s rytmem a opakujícím se refrénem, který si dítě může říkat s rodičem.
Nic strašidelného, žádné násilí, žádné ztracení rodičů. Konec je klidný a vede k usínání nebo pohodě.`;

export function storyPrompt(book: Book) {
  const hero = book.characters.find((c) => c.isHero);
  const cast = book.characters
    .map((c) => `- id "${c.id}": ${c.name} (${c.role})${c.isHero ? " – HLAVNÍ HRDINA/HRDINKA" : ""}. ${c.description}`)
    .join("\n");
  return `Napiš personalizovanou pohádku.

Pro koho: ${hero?.name ?? book.childName}, ${book.childAge} roky/let.
Téma / o čem to má být: ${book.theme || "vymysli sama, něco radostného z běžného života dítěte"}.
${book.lesson ? `Co si z toho má dítě odnést: ${book.lesson}.` : ""}
Postavy (používej jen tyto, případně bezejmenná zvířátka v pozadí):
${cast}

Požadavky:
- Přesně ${book.pageCount} stran. Každá strana 2–4 krátké věty (pro ${book.childAge} roky), celkem max ~${book.pageCount * 40} slov.
- Hlavní hrdina je aktivní – on/ona řeší situaci. Každá vedlejší postava má aspoň jednu stranu, kde je důležitá, a projevuje se podle popisu.
- Opakující se refrén (stejná věta) aspoň na 3 stranách.
- Pro každou stranu napiš "scene" = ANGLICKY popis ilustrace pro ilustrátora: kdo je na obrázku, co přesně dělá, kde, výraz tváře, denní doba.
  Nepopisuj vzhled postav (ten ilustrátor zná), jen akci a prostředí. Jedna jasná scéna, žádný text v obrázku.
- "characters" = seznam id postav, které jsou na ilustraci vidět (max 4).
- "coverScene" = anglicky popis obálky se všemi hlavními postavami.
- "title" = krátký název pohádky česky.`;
}

export const STORY_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    coverScene: { type: "STRING" },
    coverCharacters: { type: "ARRAY", items: { type: "STRING" } },
    pages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          scene: { type: "STRING" },
          characters: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["text", "scene", "characters"],
      },
    },
  },
  required: ["title", "coverScene", "coverCharacters", "pages"],
};

// ---------- 4) Ilustrace strany ----------
export function pageImagePrompt(book: Book, scene: string, chars: Character[], isCover: boolean) {
  const refs = chars
    .map((c, i) => `Reference image ${i + 1} = ${c.name}, ${c.role}. ${c.visual ?? ""}`)
    .join("\n");
  return `Illustrate one page of a children's picture book for a ${book.childAge}-year-old.
Style: ${stylePrompt(book.styleId, book.customStyle)}.
${isCover ? `This is the BOOK COVER. Leave calm empty space in the top third for the title (do NOT write any text).` : ""}
Scene: ${scene}

Characters in this scene – draw them so they look exactly like their reference images (same colours, proportions, clothing, markings):
${refs || "(no main characters)"}

Rules: consistent style with the references, warm and safe mood, clear composition readable by a small child,
no text, letters or captions anywhere in the image, no extra limbs, only the listed characters as main figures.`;
}
