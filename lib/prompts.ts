/**
 * VŠECHNA ZADÁNÍ PRO AI NA JEDNOM MÍSTĚ.
 * Tady se ladí kvalita – uprav text, ulož, vygeneruj znovu.
 */
import type { Book, Character, Location, PlaceCount, TextLength } from "./types";
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
/** Úplná anatomie – fotky často ruce schovávají (oříznutí, v náručí), model je pak vynechá. */
export const ANATOMY_RULE = `ANATOMY: every person has a complete body – exactly two arms and two hands with five fingers each, two legs;
animals have all four legs and a tail where natural. Never omit, hide-by-merging or duplicate limbs. A limb may be only naturally
hidden behind another object or person, never missing.`;

export function characterSheetPrompt(book: Book, c: Character) {
  return `Create a single character reference illustration for a children's picture book.
Style: ${stylePrompt(book.styleId, book.customStyle)}.
Subject: ${c.role}. ${c.visual ?? ""}
Use the attached photo(s) ONLY as likeness reference – keep the recognizable features (face shape, hair/fur colours, markings,
glasses, beard…) but redraw fully in the illustration style, friendly and cute, suitable for a ${book.childAge}-year-old.
Full body, front three-quarter view, neutral pose, gentle smile, plain very light background, no text, no other characters.
${ANATOMY_RULE} On this card both arms and both hands (or all four legs for an animal) must be clearly visible, relaxed and separate
from the body – even if the photo hides them (crossed arms, hands in pockets, cropped photo, someone holding the child).`;
}

// ---------- 3) Příběh ----------
export const TEXT_LENGTHS: Record<TextLength, { label: string; sentences: string; words: number; maxChars: number }> = {
  short: { label: "Krátké (2–3 věty)", sentences: "2–3 krátké věty", words: 30, maxChars: 200 },
  medium: { label: "Střední (4–5 vět)", sentences: "4–5 vět", words: 60, maxChars: 350 },
  long: { label: "Dlouhé (6–8 vět, na čtení před spaním)", sentences: "6–8 vět, klidně s popisem prostředí, pocitů a krátkými dialogy", words: 80, maxChars: 480 },
};

/** Kolik znaků se vejde na stranu knížky (A4 na šířku, text vedle obrázku) – tvrdý strop pro všechny délky. */
export const MAX_PAGE_CHARS = 480;
export const maxChars = (book: Pick<Book, "textLength">) => TEXT_LENGTHS[book.textLength ?? "medium"].maxChars;

/** Zkrácení textu strany, který se nevejde. */
export function shortenPrompt(text: string, max: number) {
  return `Tento text strany české dětské pohádky je moc dlouhý a nevejde se na stránku knížky.
Zkrať ho na NEJVÝŠ ${max} znaků (včetně mezer). Zachovej děj, jména, přímou řeč a refrén, pokud tam je.
Vyprávění v minulém čase. Vrať POUZE nový text, nic jiného.

Text (${text.length} znaků): ${text}`;
}

/** Vyprávění v minulém čase jako v klasické pohádce; přímá řeč postav normálně (přítomný čas apod.). */
export const TENSE_RULE = `ČAS: vyprávěj v MINULÉM ČASE jako klasická pohádka („Eliška se probudila a běžela k oknu.“), ne v přítomném.
Přímá řeč postav v uvozovkách zůstává přirozená, klidně v přítomném čase („Pojď, jdeme ven!“ zavolal strejda.).`;

export const STORY_SYSTEM = `Jsi zkušená autorka českých pohádek pro malé děti. Píšeš přirozenou, hezkou češtinou
(správné skloňování jmen, 5. pád při oslovení), krátkými větami, s rytmem a opakujícím se refrénem, který si dítě může říkat s rodičem.
Nic strašidelného, žádné násilí, žádné ztracení rodičů. Konec je klidný a vede k usínání nebo pohodě.
${TENSE_RULE}`;

/** Přání rodiče, kde se má děj odehrávat – platí pro příběh i pro rozdělení prostředí. */
function placesLine(book: Book) {
  if (!book.places?.trim()) return "";
  return `KDE SE MÁ DĚJ ODEHRÁVAT (přání rodiče, dodrž ho): ${book.places.trim()}
Použij tato místa (můžeš vynechat to, které se do děje nehodí, ale nevymýšlej jiná, pokud to děj nutně nevyžaduje).
Do anglického popisu každého takového místa v "locations" převezmi všechny konkrétní detaily, které rodič uvedl.`;
}

/** Volba počtu míst ve formuláři. */
export const PLACE_COUNTS: { id: PlaceCount | ""; label: string; plates: number }[] = [
  { id: "", label: "Nechat na AI (obvykle 2–3)", plates: 3 },
  { id: "1", label: "Jedno místo – nejjednotnější obrázky", plates: 1 },
  { id: "2-3", label: "2–3 místa", plates: 3 },
  { id: "4-5", label: "4–5 míst – např. výlet s více zastávkami", plates: 5 },
];

function placeRule(book: Book) {
  switch (book.placeCount) {
    case "1": return "PŘESNĚ 1 místo – celý děj se odehrává na jednom místě";
    case "2-3": return "2 až 3 místa";
    case "4-5": return "4 až 5 míst (rozlož je rozumně, sousední strany na stejném místě)";
    default: return "MÁLO míst (1–3, max 4)";
  }
}

export function storyPrompt(book: Book) {
  const hero = book.characters.find((c) => c.isHero);
  const cast = book.characters
    .map((c) => `- id "${c.id}": ${c.name} (${c.role})${c.isHero ? " – HLAVNÍ HRDINA/HRDINKA" : ""}. ${c.description}`)
    .join("\n");
  return `Napiš personalizovanou pohádku.

Pro koho: ${hero?.name ?? book.childName}, ${book.childAge} roky/let.
Téma / o čem to má být: ${book.theme || "vymysli sama, něco radostného z běžného života dítěte"}.
${book.lesson ? `Co si z toho má dítě odnést: ${book.lesson}.` : ""}
${placesLine(book)}
Postavy (používej jen tyto, případně bezejmenná zvířátka v pozadí):
${cast}

Požadavky:
- Přesně ${book.pageCount} stran. Každá strana má ${TEXT_LENGTHS[book.textLength ?? "medium"].sentences} (cca ${TEXT_LENGTHS[book.textLength ?? "medium"].words} slov, NEJVÝŠ ${maxChars(book)} znaků včetně mezer – jinak se text nevejde na stránku). Věty srozumitelné pro ${book.childAge} roky.
- Hlavní hrdina je aktivní – on/ona řeší situaci. Každá vedlejší postava má aspoň jednu stranu, kde je důležitá, a projevuje se podle popisu.
- Opakující se refrén (stejná věta) aspoň na 3 stranách.
- Pro každou stranu napiš "scene" = ANGLICKY popis ilustrace pro ilustrátora: kdo je na obrázku, co přesně dělá, kde, výraz tváře, denní doba.
  Nepopisuj vzhled ani OBLEČENÍ postav (ten ilustrátor zná a musí zůstat všude stejný), jen akci a prostředí. Jedna jasná scéna, žádný text v obrázku.
- "characters" = seznam id postav, které jsou na ilustraci vidět (max 4).
- PROSTŘEDÍ: děj se odehrává v těchto počtu míst: ${placeRule(book)}. Každé místo popiš v "locations" (id, krátký český název,
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
no text, letters or captions anywhere in the image.
${ANATOMY_RULE}`;
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
or if someone looks clearly different from their card: other hair/fur colour or length, other clothing colour or garment,
or if any figure has broken anatomy: a missing arm or hand (not just naturally hidden behind something), extra arms/legs/hands,
limbs merged into the body or clothing, or a clearly wrong number of fingers.
Small differences in pose, expression or drawing detail are fine. "problem" = short English description of what to fix, empty if ok.
"problemCs" = the same in Czech for the parent (one short sentence), empty if ok.`;
}

/** Kontrola karty postavy – hlavně úplná anatomie (karta je předloha pro všechny strany). */
export function sheetCheckPrompt(c: Character) {
  return `This is a character reference card for a children's picture book: ${c.name} (${c.role}).
Check ONLY the anatomy. Answer as JSON {"ok": boolean, "problem": string}.
ok=false if: a person is missing an arm or hand (a sleeve ending in nothing, an arm stump, an arm hidden or merged into the body),
has extra arms/legs/hands, clearly wrong number of fingers, or an animal is missing a leg or has extra legs.
Both arms and hands of a person must be clearly visible. "problem" = short English description of what to fix, empty if ok.`;
}

export const IMAGE_CHECK_SCHEMA = {
  type: "OBJECT",
  properties: { ok: { type: "BOOLEAN" }, problem: { type: "STRING" }, problemCs: { type: "STRING" } },
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

1. Urči místa, kde se děj odehrává – počet: ${placeRule(book)} ("locations": id, český název, ANGLICKY podrobný stálý popis prostředí s konkrétními prvky a barvami).
2. Ke každé straně urči "location" (id místa). Sousední strany, kde děj místo nemění, musí mít stejné místo.
3. Ke každé straně přepiš "scene" (anglicky) tak, aby popisovala jen akci postav a nepřidávala nové prvky prostředí, které v popisu místa nejsou.
4. "atmosphere" = anglicky roční období, denní doba, počasí a světlo pro celou knížku.
${placesLine(book)}

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

Vrať POUZE nový text této strany. Zachovej styl, délku (${TEXT_LENGTHS[book.textLength ?? "medium"].sentences}, nejvýš ${maxChars(book)} znaků),
jména postav a návaznost na okolní strany. ${TENSE_RULE}
Nic jiného nepiš.`;
}

export function pageImageEditPrompt(book: Book, chars: Character[], comment: string) {
  const refs = chars.map((c, i) => `Reference image ${i + 2} = ${c.name}, ${c.role}.${c.outfit ? ` Wears exactly: ${c.outfit}` : ""}`).join("\n");
  return `The first attached image is an illustration from a children's picture book.
Edit it according to the parent's request (written in Czech): "${comment}"
Change ONLY what the request asks for. Keep the composition, background, lighting, style and everything else as identical as possible.
Characters must still match their reference images:
${refs || "(none)"}
Each character appears EXACTLY ONCE – never duplicate anyone, never add extra people or animals.
${ANATOMY_RULE}
No text, letters or captions in the image.`;
}

// ---------- 7) Ukázka stylu ilustrací (pro výběr stylu ve formuláři) ----------
export function stylePreviewPrompt(style: string) {
  return `Paint a sample illustration for a children's picture book to show the illustration style.
Style: ${style}.
Scene: a smiling little girl (about 4 years old) and a friendly brown dog walking along a path through a sunny meadow
towards a small house with a tree, a few flowers and a butterfly. Warm, cozy, safe mood.
Fictional generic characters only. No text, letters or captions in the image.`;
}

// ---------- 8) Převod hotových textů do minulého času ----------
export function pastTensePrompt(texts: { n: number; text: string }[]) {
  return `Tady jsou texty stran české dětské pohádky. Převeď VYPRÁVĚNÍ do minulého času (klasický pohádkový styl).
${TENSE_RULE}
Měň jen slovesný čas a to, co si změna nutně vyžádá (slovosled, spojky). Obsah, jména, refrén, délku,
přímou řeč ani styl NEMĚŇ. Pokud je strana už v minulém čase, vrať ji beze změny.
Refrén převeď na všech stranách stejně.

Strany:
${texts.map((t) => `[${t.n}] ${t.text}`).join("\n")}

Vrať JSON: pro každou stranu { "n": číslo strany, "text": nový text }.`;
}

export const PAST_TENSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: { n: { type: "INTEGER" }, text: { type: "STRING" } },
    required: ["n", "text"],
  },
};

// ---------- 9) Překlady zadání (angličtina pro Gemini ↔ čeština pro rodiče) ----------
export function toCzechPrompt(items: { key: string; en: string }[]) {
  return `Přelož tyto anglické popisy pro ilustrátora dětské knížky do přirozené češtiny.
Jde o popisy vzhledu postav, oblečení, scén a prostředí. Překládej věrně, nic nepřidávej ani nevynechávej,
jména postav nech beze změny. Vrať JSON pole objektů { "key": stejný klíč, "cs": český překlad }.

${items.map((i) => `[${i.key}] ${i.en}`).join("\n")}`;
}

export const TO_CZECH_SCHEMA = {
  type: "ARRAY",
  items: { type: "OBJECT", properties: { key: { type: "STRING" }, cs: { type: "STRING" } }, required: ["key", "cs"] },
};

export function toEnglishPrompt(cs: string, previousEn: string) {
  return `Rodič upravil český popis pro ilustrátora dětské knížky. Přelož novou českou verzi do angličtiny
pro AI ilustrátora. Překládej věrně – co rodič přidal, přidej; co smazal, vynech. Jména postav nech beze změny.
Pro styl a odborné výrazy se můžeš opřít o původní anglickou verzi, ale obsah se musí řídit českou verzí.

Původní anglická verze: ${previousEn || "(žádná)"}
Nová česká verze: ${cs}

Vrať POUZE anglický text, nic jiného.`;
}
