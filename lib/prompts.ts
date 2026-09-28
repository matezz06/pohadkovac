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
facial hair, glasses, distinctive marks. Do NOT describe clothing (it is defined separately). No names, no personality, no background.`;
}

// ---------- 1b) Oblečení podle karty postavy ----------
export function outfitPrompt(c: Character) {
  return `The attached image is the official character reference of "${c.name}" (${c.role}) for a picture book.
Describe EXACTLY what the character wears so an illustrator can repeat it identically on every page:
each garment/accessory with its colour and pattern (e.g. "white t-shirt with small rainbow prints, orange shorts,
pink socks, white sneakers"; for animals collar colour or "no collar"). One line, English, max 40 words, clothing only.`;
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
  Nepopisuj vzhled ani OBLEČENÍ postav (ten ilustrátor zná a musí zůstat všude stejný), jen akci a prostředí. Jedna jasná scéna, žádný text v obrázku.
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
/** Kdo je na obrázku – s počty podle druhu, aby model nikoho nezdvojil. */
function castLine(chars: Character[]) {
  if (!chars.length) return "NO main characters in this image – only the environment (at most tiny unnamed background animals).";
  const names = chars.map((c) => `${c.name} (${c.role})`).join(", ");
  return `The image contains EXACTLY ${chars.length} main figure${chars.length > 1 ? "s" : ""}: ${names}.
Each of them appears EXACTLY ONCE. Never draw the same character twice (no duplicates, no mirrored copies, no "before/after" versions).
Do not add any other people or animals – count them before finishing.`;
}

export function pageImagePrompt(
  book: Book,
  scene: string,
  chars: Character[],
  isCover: boolean,
  location?: Location,
  hasPlate = false,
  extraWarning = "",
) {
  const refs = chars
    .map((c, i) => `Reference image ${i + 1} = ${c.name}, ${c.role}. ${c.visual ?? ""}${c.outfit ? `\n   Wears EXACTLY (same on every page, never change; ignore any other clothing mentioned above): ${c.outfit}` : ""}`)
    .join("\n");
  const env = hasPlate
    ? `Reference image ${chars.length + 1} = the EMPTY BACKGROUND of this place (no characters). Use it as the setting:
keep the same landscape, background elements, their layout, colours and lighting. The camera angle may shift slightly.`
    : "";
  return `Illustrate one page of a children's picture book for a ${book.childAge}-year-old.
Style: ${stylePrompt(book.styleId, book.customStyle)}.
${isCover ? `This is the BOOK COVER. Leave calm empty space in the top third for the title (do NOT write any text).` : ""}
${book.atmosphere ? `Atmosphere (same for the whole book): ${book.atmosphere}.` : ""}
${location ? `Setting – ${location.name}: ${location.description}` : ""}
Scene: ${scene}

Character references – draw each so they look exactly like their reference image (same colours, proportions, clothing, markings):
${refs || "(none)"}
${env}

${castLine(chars)}
Clothing, colours and accessories of every character must be IDENTICAL to their reference image – no outfit changes.
${extraWarning}

Rules: consistent style with the references, warm and safe mood, clear composition readable by a small child,
no text, letters or captions anywhere in the image, no extra limbs.`;
}

/** Prázdné pozadí místa – jednou na místo, pak předloha pro všechny jeho strany. */
export function locationPlatePrompt(book: Book, location: Location) {
  return `Paint an EMPTY background for a children's picture book – no people, no animals, no characters at all.
Style: ${stylePrompt(book.styleId, book.customStyle)}.
${book.atmosphere ? `Atmosphere: ${book.atmosphere}.` : ""}
Place – ${location.name}: ${location.description}
Wide establishing view with open space in the foreground where characters can later stand. No text.`;
}

/** Kontrola hotového obrázku: nikdo zdvojený, nikdo navíc. */
export function imageCheckPrompt(chars: Character[]) {
  const list = chars.length ? chars.map((c) => `${c.name} (${c.role}${c.outfit ? `; wears: ${c.outfit}` : ""})`).join(", ") : "nobody";
  const cards = chars.length
    ? `The FIRST image is the illustration to check. The following images are the official character cards, in this order: ${chars.map((c) => c.name).join(", ")}.`
    : "The image is the illustration to check.";
  return `Check this children's book illustration. ${cards}
Expected main figures, each exactly once: ${list}.
Count every person and every animal visible (ignore tiny birds/insects in the background).
Answer as JSON: {"ok": boolean, "problem": string}. ok=false if any expected figure appears more than once,
if there is an extra person or extra dog/cat, if an expected figure is missing,
or if someone looks clearly different from their card: other hair/fur colour or length, other clothing colour or garment.
Small differences in pose, expression or drawing detail are fine. "problem" = short English description of what to fix, empty if ok.`;
}

export const IMAGE_CHECK_SCHEMA = {
  type: "OBJECT",
  properties: { ok: { type: "BOOLEAN" }, problem: { type: "STRING" } },
  required: ["ok", "problem"],
};

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

// ---------- 6) Zákaznická vlna úprav ----------
export function characterRevisionPrompt(book: Book, c: Character, comment: string) {
  return `The first attached image is a character reference illustration for a children's picture book (${c.name}, ${c.role}).
Revise it according to the parent's request (written in Czech): "${comment}"
Change ONLY what the request asks for. Keep the same illustration style (${stylePrompt(book.styleId, book.customStyle)}),
pose, framing, plain light background and everything else. The other attached photos are the real-life likeness reference.
No text in the image.`;
}

export function pageTextRevisionPrompt(book: Book, pageText: string, prev: string, next: string, comment: string) {
  return `Uprav text jedné strany dětské pohádky podle připomínky rodiče.
Předchozí strana: ${prev || "(žádná)"}
TATO STRANA: ${pageText}
Následující strana: ${next || "(žádná)"}
Připomínka rodiče: ${comment}

Vrať POUZE nový text této strany. Zachovej styl, délku (${TEXT_LENGTHS[book.textLength ?? "medium"].sentences}),
jména postav a návaznost na okolní strany. Nic jiného nepiš.`;
}

export function pageImageEditPrompt(book: Book, chars: Character[], comment: string) {
  const refs = chars.map((c, i) => `Reference image ${i + 2} = ${c.name}, ${c.role}.${c.outfit ? ` Wears exactly: ${c.outfit}` : ""}`).join("\n");
  return `The first attached image is an illustration from a children's picture book.
Edit it according to the parent's request (written in Czech): "${comment}"
Change ONLY what the request asks for. Keep the composition, background, lighting, style and everything else as identical as possible.
Characters must still match their reference images:
${refs || "(none)"}
Each character appears EXACTLY ONCE – never duplicate anyone, never add extra people or animals.
No text, letters or captions in the image.`;
}
