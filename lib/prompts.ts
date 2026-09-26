/**
 * VŠECHNA ZADÁNÍ PRO AI NA JEDNOM MÍSTĚ.
 * Tady se ladí kvalita – uprav text, ulož, vygeneruj znovu.
 */
import type { Book, Character, Location, TextLength } from "./types";
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
export const TEXT_LENGTHS: Record<TextLength, { label: string; sentences: string; words: number }> = {
  short: { label: "Krátké (2–3 věty)", sentences: "2–3 krátké věty", words: 30 },
  medium: { label: "Střední (4–5 vět)", sentences: "4–5 vět", words: 60 },
  long: { label: "Dlouhé (6–8 vět, na čtení před spaním)", sentences: "6–8 vět, klidně s popisem prostředí, pocitů a krátkými dialogy", words: 110 },
};

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
- Přesně ${book.pageCount} stran. Každá strana má ${TEXT_LENGTHS[book.textLength ?? "medium"].sentences} (cca ${TEXT_LENGTHS[book.textLength ?? "medium"].words} slov na stranu). Věty srozumitelné pro ${book.childAge} roky.
- Hlavní hrdina je aktivní – on/ona řeší situaci. Každá vedlejší postava má aspoň jednu stranu, kde je důležitá, a projevuje se podle popisu.
- Opakující se refrén (stejná věta) aspoň na 3 stranách.
- Pro každou stranu napiš "scene" = ANGLICKY popis ilustrace pro ilustrátora: kdo je na obrázku, co přesně dělá, kde, výraz tváře, denní doba.
  Nepopisuj vzhled postav (ten ilustrátor zná), jen akci a prostředí. Jedna jasná scéna, žádný text v obrázku.
- "characters" = seznam id postav, které jsou na ilustraci vidět (max 4).
- PROSTŘEDÍ: děj se odehrává v MÁLO místech (1–3, max 4). Každé místo popiš v "locations" (id, krátký český název,
  a ANGLICKY podrobný stálý popis: typ krajiny, konkrétní výrazné prvky – stromy, cesta, plot, rybník…, barvy).
  Každá strana má "location" = id místa. Po sobě jdoucí strany na stejném místě MUSÍ mít stejné location,
  a jejich "scene" nesmí prostředí popisovat jinak (žádné nové řeky, kopce apod., pokud tam děj opravdu nepřejde).
- "atmosphere" = anglicky roční období, denní doba, počasí a světlo – platí pro celou knížku, pokud se v ději výslovně nemění.
- "coverScene" = anglicky popis obálky se všemi hlavními postavami.
- "title" = krátký název pohádky česky.`;
}

export const STORY_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    coverScene: { type: "STRING" },
    coverCharacters: { type: "ARRAY", items: { type: "STRING" } },
    atmosphere: { type: "STRING" },
    locations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "STRING" }, name: { type: "STRING" }, description: { type: "STRING" } },
        required: ["id", "name", "description"],
      },
    },
    pages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          scene: { type: "STRING" },
          characters: { type: "ARRAY", items: { type: "STRING" } },
          location: { type: "STRING" },
        },
        required: ["text", "scene", "characters", "location"],
      },
    },
  },
  required: ["title", "coverScene", "coverCharacters", "atmosphere", "locations", "pages"],
};

// ---------- 4) Ilustrace strany ----------
export function pageImagePrompt(
  book: Book,
  scene: string,
  chars: Character[],
  isCover: boolean,
  location?: Location,
  hasEnvRef = false,
) {
  const refs = chars
    .map((c, i) => `Reference image ${i + 1} = ${c.name}, ${c.role}. ${c.visual ?? ""}`)
    .join("\n");
  const env = hasEnvRef
    ? `Reference image ${chars.length + 1} = the PREVIOUS PAGE of this book, set in the same place. Keep the SAME environment:
same landscape, background elements, their layout and colours, same lighting and time of day. Only the characters' action,
poses and a slightly different camera angle may change. Do not copy the characters from it – use their own reference images.`
    : "";
  return `Illustrate one page of a children's picture book for a ${book.childAge}-year-old.
Style: ${stylePrompt(book.styleId, book.customStyle)}.
${isCover ? `This is the BOOK COVER. Leave calm empty space in the top third for the title (do NOT write any text).` : ""}
${book.atmosphere ? `Atmosphere (same for the whole book): ${book.atmosphere}.` : ""}
${location ? `Setting – ${location.name}: ${location.description}` : ""}
Scene: ${scene}

Characters in this scene – draw them so they look exactly like their reference images (same colours, proportions, clothing, markings):
${refs || "(no main characters)"}
${env}

Rules: consistent style with the references, warm and safe mood, clear composition readable by a small child,
no text, letters or captions anywhere in the image, no extra limbs, only the listed characters as main figures.`;
}

// ---------- 5) Doplnění míst k hotovému příběhu (texty zůstanou) ----------
export function locationsPrompt(book: Book) {
  const pages = book.pages
    .filter((p) => p.n > 0)
    .map((p) => `Strana ${p.n}: ${p.text}\nScéna: ${p.scene}`)
    .join("\n\n");
  return `Tady je hotová dětská pohádka rozdělená na strany. Texty NEMĚŇ.
Úkol: sjednoť prostředí ilustrací, aby se pozadí mezi stranami zbytečně neměnilo.

1. Urči 1–4 místa, kde se děj odehrává ("locations": id, český název, ANGLICKY podrobný stálý popis prostředí s konkrétními prvky a barvami).
2. Ke každé straně urči "location" (id místa). Sousední strany, kde děj místo nemění, musí mít stejné místo.
3. Ke každé straně přepiš "scene" (anglicky) tak, aby popisovala jen akci postav a nepřidávala nové prvky prostředí, které v popisu místa nejsou.
4. "atmosphere" = anglicky roční období, denní doba, počasí a světlo pro celou knížku.

${pages}`;
}

export const LOCATIONS_SCHEMA = {
  type: "OBJECT",
  properties: {
    atmosphere: { type: "STRING" },
    locations: STORY_SCHEMA.properties.locations,
    pages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { n: { type: "INTEGER" }, location: { type: "STRING" }, scene: { type: "STRING" } },
        required: ["n", "location", "scene"],
      },
    },
  },
  required: ["atmosphere", "locations", "pages"],
};
