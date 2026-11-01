import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fsp } from "fs";
import os from "os";
import path from "path";
import { generateImage, generateText, isMock, type InputPart, type Usage } from "./gemini";
import { loadBook, readBookFile, updateBook, writeBookFile, newId } from "./store";
import {
  characterSheetPrompt,
  pageImagePrompt,
  STORY_SCHEMA,
  STORY_SYSTEM,
  storyPrompt,
  visualDescriptionPrompt,
  locationsPrompt,
  LOCATIONS_SCHEMA,
  characterRevisionPrompt,
  pageTextRevisionPrompt,
  pageImageEditPrompt,
  locationPlatePrompt,
  imageCheckPrompt,
  IMAGE_CHECK_SCHEMA,
  outfitPrompt,
  pastTensePrompt,
  PAST_TENSE_SCHEMA,
  sheetCheckPrompt,
  shortenPrompt,
  maxChars,
  toCzechPrompt,
  TO_CZECH_SCHEMA,
  toEnglishPrompt,
} from "./prompts";
import { getEn, missingCs, setEn } from "./czech";
import type { Book, Page, UsageEntry } from "./types";

function usage(kind: UsageEntry["kind"], u: Usage): UsageEntry {
  return { at: new Date().toISOString(), kind, ...u };
}

async function must(id: string): Promise<Book> {
  const b = await loadBook(id);
  if (!b) throw new Error("Knížka nenalezena");
  return b;
}

async function img(bookId: string, file: string): Promise<InputPart> {
  const buf = await readBookFile(bookId, file);
  return { image: buf, mime: file.endsWith(".png") ? "image/png" : "image/jpeg" };
}

/** Uložení nahrané fotky – zmenšení šetří tokeny. */
const run = promisify(execFile);

/** HEIC (fotky z iPhonu) sharp neumí – na Macu je převede vestavěný nástroj `sips`. */
async function heicToJpeg(data: Buffer): Promise<Buffer> {
  if (process.platform !== "darwin") {
    throw new Error("Fotka je ve formátu HEIC (iPhone), který zatím neumíme. Ulož ji prosím jako JPG a nahraj znovu.");
  }
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "heic-"));
  try {
    const src = path.join(dir, "in.heic");
    const dst = path.join(dir, "out.jpg");
    await fsp.writeFile(src, data);
    await run("sips", ["-s", "format", "jpeg", src, "--out", dst]);
    return await fsp.readFile(dst);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

export async function storePhoto(bookId: string, data: Buffer) {
  const name = `photo-${newId()}.jpg`;
  const resize = (b: Buffer) =>
    sharp(b).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  let out: Buffer;
  try {
    out = await resize(data);
  } catch {
    out = await resize(await heicToJpeg(data));
  }
  await writeBookFile(bookId, name, out);
  return name;
}

async function storeGenerated(bookId: string, prefix: string, data: Buffer) {
  const name = `${isMock() ? "mock-" : ""}${prefix}-${newId()}.png`;
  await writeBookFile(bookId, name, await sharp(data).png().toBuffer());
  return name;
}

export async function describeCharacter(bookId: string, cid: string) {
  const book = await must(bookId);
  const c = book.characters.find((x) => x.id === cid);
  if (!c) throw new Error("Postava nenalezena");
  if (isMock()) {
    return updateBook(bookId, (b) => {
      const t = b.characters.find((x) => x.id === cid)!;
      t.visual = `(mock) friendly ${t.role}`;
    });
  }
  const input: InputPart[] = [{ text: visualDescriptionPrompt(c) }, ...(await Promise.all(c.photos.map((p) => img(bookId, p))))];
  const { text, usage: u } = await generateText(input, { temperature: 0.3 });
  return updateBook(bookId, (b) => {
    const t = b.characters.find((x) => x.id === cid)!;
    t.visual = text.trim();
    b.usage.push(usage("visual", u));
  });
}

export async function generateSheet(bookId: string, cid: string) {
  let book = await must(bookId);
  let c = book.characters.find((x) => x.id === cid);
  if (!c) throw new Error("Postava nenalezena");
  if ((!c.visual || c.visual.startsWith("(mock)")) && c.photos.length && !isMock()) {
    book = await describeCharacter(bookId, cid);
    c = book.characters.find((x) => x.id === cid)!;
  }
  const photos = await Promise.all(c.photos.map((p) => img(bookId, p)));
  // karta je předloha pro všechny strany – chyba v anatomii (chybějící ruka) by se táhla celou knížkou,
  // proto ji zkontrolujeme a případně až 2× překreslíme
  let r = await generateImage([{ text: characterSheetPrompt(book, c) }, ...photos], { aspectRatio: "3:4", mockLabel: c.name });
  const uses: UsageEntry[] = [usage("sheet", r.usage)];
  for (let attempt = 0; attempt < 2 && !isMock(); attempt++) {
    let check = { ok: true, problem: "" };
    try {
      const t = await generateText([{ text: sheetCheckPrompt(c) }, { image: r.image, mime: r.mime }], {
        schema: IMAGE_CHECK_SCHEMA,
        temperature: 0,
      });
      uses.push(usage("visual", t.usage));
      check = JSON.parse(t.text);
    } catch {
      break; // kontrola je jen pojistka
    }
    if (check.ok) break;
    const warn = `IMPORTANT – the previous attempt was rejected: ${check.problem}. Fix this.`;
    r = await generateImage([{ text: `${characterSheetPrompt(book, c)}\n${warn}` }, ...photos], { aspectRatio: "3:4", mockLabel: c.name });
    uses.push(usage("sheet", r.usage));
  }
  const file = await storeGenerated(bookId, `sheet-${cid}`, r.image);
  await updateBook(bookId, (b) => {
    const t = b.characters.find((x) => x.id === cid)!;
    t.sheet = file;
    t.outfit = undefined;
    b.usage.push(...uses);
    markStale(b, (p) => p.characters.includes(cid));
  });
  return describeOutfit(bookId, cid);
}

/** Přesný popis oblečení podle karty postavy – drží stejné oblečení na všech stranách. */
export async function describeOutfit(bookId: string, cid: string) {
  const book = await must(bookId);
  const c = book.characters.find((x) => x.id === cid);
  if (!c?.sheet) return book;
  if (isMock()) {
    return updateBook(bookId, (b) => {
      b.characters.find((x) => x.id === cid)!.outfit = "(mock) same outfit as on the card";
    });
  }
  const r = await generateText([{ text: outfitPrompt(c) }, await img(bookId, c.sheet)], { temperature: 0.2 });
  return updateBook(bookId, (b) => {
    b.characters.find((x) => x.id === cid)!.outfit = r.text.trim();
    b.usage.push(usage("visual", r.usage));
  });
}

async function ensureOutfits(bookId: string, ids: string[]) {
  const book = await must(bookId);
  for (const c of book.characters) {
    if (ids.includes(c.id) && c.sheet && !c.outfit) await describeOutfit(bookId, c.id);
  }
  return must(bookId);
}

type StoryJson = {
  title: string;
  coverScene: string;
  coverCharacters: string[];
  atmosphere?: string;
  locations?: { id: string; name: string; description: string }[];
  pages: { text: string; scene: string; characters: string[]; location?: string }[];
};

function mockStory(book: Book): StoryJson {
  const hero = book.characters.find((c) => c.isHero) ?? book.characters[0];
  const ids = book.characters.map((c) => c.id);
  return {
    title: `${hero?.name ?? book.childName} a velké dobrodružství`,
    coverScene: "All characters standing together in a sunny meadow",
    coverCharacters: ids.slice(0, 4),
    atmosphere: "sunny late summer afternoon",
    locations: [
      { id: "garden", name: "zahrada", description: "a cozy family garden with a wooden fence and an apple tree" },
      { id: "meadow", name: "louka", description: "a flowery meadow with a small pond" },
    ],
    pages: Array.from({ length: book.pageCount }, (_, i) => {
      const c = book.characters[i % book.characters.length];
      return {
        text: `Strana ${i + 1}. ${hero?.name} potkala ${c?.name}. „Hop a skok, už je tu zas!“`,
        scene: `Page ${i + 1}: ${hero?.name} and ${c?.name} playing in the garden`,
        characters: Array.from(new Set([hero?.id, c?.id].filter(Boolean) as string[])),
        location: i < book.pageCount / 2 ? "garden" : "meadow",
      };
    }),
  };
}

export async function generateStory(bookId: string) {
  const book = await must(bookId);
  let story: StoryJson;
  let u: Usage | null = null;
  const extra: UsageEntry[] = [];
  if (isMock()) story = mockStory(book);
  else {
    const r = await generateText([{ text: storyPrompt(book) }], { schema: STORY_SCHEMA, system: STORY_SYSTEM });
    story = JSON.parse(r.text);
    u = r.usage;
    // pojistka: strany, které se nevejdou na stránku, rovnou zkrátíme
    const max = maxChars(book);
    await Promise.all(
      story.pages.map(async (p) => {
        if (p.text.length <= max) return;
        try {
          const s = await generateText([{ text: shortenPrompt(p.text, max) }], { temperature: 0.3 });
          const t = s.text.trim().replace(/^["„]|["“]$/g, "");
          if (t && t.length < p.text.length) p.text = t;
          extra.push(usage("story", s.usage));
        } catch {
          /* necháme původní text, v editoru je vidět varování */
        }
      }),
    );
  }
  const valid = new Set(book.characters.map((c) => c.id));
  const clean = (ids: string[]) => (ids ?? []).filter((id) => valid.has(id)).slice(0, 4);
  return updateBook(bookId, (b) => {
    b.title = story.title;
    b.atmosphere = story.atmosphere;
    b.locations = (story.locations ?? []).map((l) => ({ ...l, plate: undefined }));
    const locIds = new Set(b.locations.map((l) => l.id));
    const cover: Page = { n: 0, text: story.title, scene: story.coverScene, characters: clean(story.coverCharacters) };
    b.pages = [cover, ...story.pages.map((p, i) => ({ n: i + 1, text: p.text, scene: p.scene, characters: clean(p.characters), location: p.location && locIds.has(p.location) ? p.location : undefined }))];
    if (u) b.usage.push(usage("story", u));
    b.usage.push(...extra);
  });
}

/** Zkrátí text strany pod limit knížky. */
export async function shortenPageText(bookId: string, n: number) {
  const book = await must(bookId);
  const page = book.pages.find((p) => p.n === n);
  if (!page) throw new Error("Strana nenalezena");
  const max = maxChars(book);
  if (isMock()) return updateBook(bookId, (b) => { b.pages.find((x) => x.n === n)!.text = page.text.slice(0, max - 1) + "…"; });
  const r = await generateText([{ text: shortenPrompt(page.text, max) }], { temperature: 0.3 });
  return updateBook(bookId, (b) => {
    b.pages.find((x) => x.n === n)!.text = r.text.trim().replace(/^["„]|["“]$/g, "");
    b.usage.push(usage("story", r.usage));
  });
}

/** Nakreslí (nebo s force překreslí) pozadí místa samostatně – ať jde zkontrolovat před kreslením stran. */
export async function drawLocationPlate(bookId: string, locId: string, force = false) {
  await ensureLocationPlate(bookId, locId, force);
  if (force) await updateBook(bookId, (b) => markStale(b, (p) => p.n > 0 && p.location === locId));
  return must(bookId);
}

/** Prázdné pozadí místa (bez postav). Vzniká jednou a slouží jako předloha pro všechny strany z toho místa. */
async function ensureLocationPlate(bookId: string, locId: string, force = false): Promise<string | undefined> {
  const book = await must(bookId);
  const loc = book.locations?.find((l) => l.id === locId);
  if (!loc) return undefined;
  if (!force && loc.plate && (isMock() || !loc.plate.startsWith("mock-"))) return loc.plate;
  const r = await generateImage([{ text: locationPlatePrompt(book, loc) }], { aspectRatio: "4:5", mockLabel: `pozadí: ${loc.name}` });
  const file = await storeGenerated(bookId, `plate-${locId}`, r.image);
  await updateBook(bookId, (b) => {
    const l = b.locations?.find((x) => x.id === locId);
    if (l) l.plate = file;
    b.usage.push(usage("page", r.usage));
  });
  return file;
}

/** Levná kontrola textovým modelem: je každá postava na obrázku právě jednou? */
async function checkImage(bookId: string, image: Buffer, mime: string, chars: Book["characters"], refs: InputPart[]) {
  if (isMock()) return { ok: true, problem: "", problemCs: "" };
  try {
    const r = await generateText(
      [{ text: imageCheckPrompt(chars) }, { image, mime }, ...refs],
      { schema: IMAGE_CHECK_SCHEMA, temperature: 0 },
    );
    await updateBook(bookId, (b) => {
      b.usage.push(usage("visual", r.usage));
    });
    return JSON.parse(r.text) as { ok: boolean; problem: string; problemCs?: string };
  } catch {
    return { ok: true, problem: "", problemCs: "" }; // kontrola je jen pojistka – když selže, obrázek nezahazujeme
  }
}

export async function generatePageImage(bookId: string, n: number) {
  const page0 = (await must(bookId)).pages.find((p) => p.n === n);
  const book = await ensureOutfits(bookId, page0?.characters ?? []);
  const page = book.pages.find((p) => p.n === n);
  if (!page) throw new Error("Strana nenalezena");
  const chars = page.characters
    .map((id) => book.characters.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const refs: InputPart[] = [];
  for (const c of chars) {
    if (c.sheet) refs.push(await img(bookId, c.sheet));
    else if (c.photos[0]) refs.push(await img(bookId, c.photos[0]));
  }
  // Pozadí: prázdná předloha místa (bez postav) – drží stejné prostředí a nesvádí ke zdvojení postav.
  const location = book.locations?.find((l) => l.id === page.location);
  const plate = n > 0 && location ? await ensureLocationPlate(bookId, location.id) : undefined;
  const plateRef = plate ? await img(bookId, plate) : null;

  const draw = (warning = "") =>
    generateImage(
      [
        { text: pageImagePrompt(book, page.scene, chars, n === 0, location, !!plateRef, warning) },
        ...refs,
        ...(plateRef ? [plateRef] : []),
      ],
      { aspectRatio: n === 0 ? "4:3" : "4:5", mockLabel: n === 0 ? "obálka" : `strana ${n}` },
    );

  let r = await draw();
  const used = [r.usage];
  // Kontrola zdvojených / přebývajících postav – při chybě jeden automatický pokus navíc.
  const check = await checkImage(bookId, r.image, r.mime, chars, refs);
  if (!check.ok) {
    console.warn(`Strana ${n}: ${check.problem} – kreslím znovu`);
    r = await draw(`IMPORTANT – a previous attempt was rejected because: ${check.problem}. Make sure this does not happen again.`);
    used.push(r.usage);
  }
  const file = await storeGenerated(bookId, `page-${n}`, r.image);
  return updateBook(bookId, (b) => {
    const p = b.pages.find((x) => x.n === n)!;
    p.image = file;
    p.imageVersions = [...(p.imageVersions ?? []), file];
    p.stale = false;
    p.issue = undefined;
    p.checkedAt = undefined;
    for (const u of used) b.usage.push(usage("page", u));
  });
}

/** Doplní k hotovému příběhu místa a sjednotí scény – texty zůstanou. */
export async function assignLocations(bookId: string) {
  const book = await must(bookId);
  if (!book.pages.length) throw new Error("Nejdřív napiš příběh");
  type R = { atmosphere: string; locations: { id: string; name: string; description: string }[]; pages: { n: number; location: string; scene: string }[] };
  let res: R;
  let u: Usage | null = null;
  if (isMock()) {
    res = {
      atmosphere: "sunny late summer afternoon",
      locations: [{ id: "garden", name: "zahrada", description: "a cozy garden with a wooden fence" }],
      pages: book.pages.filter((p) => p.n > 0).map((p) => ({ n: p.n, location: "garden", scene: p.scene })),
    };
  } else {
    const r = await generateText([{ text: locationsPrompt(book) }], { schema: LOCATIONS_SCHEMA, temperature: 0.4 });
    res = JSON.parse(r.text);
    u = r.usage;
  }
  return updateBook(bookId, (b) => {
    markStale(b, (p) => p.n > 0);
    b.atmosphere = res.atmosphere;
    b.locations = res.locations.map((l) => ({ ...l, plate: undefined }));
    const ids = new Set(res.locations.map((l) => l.id));
    for (const x of res.pages) {
      const p = b.pages.find((q) => q.n === x.n);
      if (!p || p.n === 0) continue;
      if (ids.has(x.location)) p.location = x.location;
      if (x.scene) p.scene = x.scene;
    }
    if (u) b.usage.push(usage("story", u));
  });
}

// ---------- zákaznická vlna úprav ----------

export async function reviseCharacter(bookId: string, cid: string, comment: string) {
  const book = await must(bookId);
  const c = book.characters.find((x) => x.id === cid);
  if (!c) throw new Error("Postava nenalezena");
  if (!c.sheet) return generateSheet(bookId, cid);
  const input: InputPart[] = [
    { text: characterRevisionPrompt(book, c, comment) },
    await img(bookId, c.sheet),
    ...(await Promise.all(c.photos.map((p) => img(bookId, p)))),
  ];
  const r = await generateImage(input, { aspectRatio: "3:4", mockLabel: `${c.name} (upraveno)` });
  const file = await storeGenerated(bookId, `sheet-${cid}`, r.image);
  await updateBook(bookId, (b) => {
    const t = b.characters.find((x) => x.id === cid)!;
    t.sheet = file;
    t.outfit = undefined;
    b.usage.push(usage("sheet", r.usage));
  });
  return describeOutfit(bookId, cid);
}

export async function revisePageText(bookId: string, n: number, comment: string) {
  const book = await must(bookId);
  const page = book.pages.find((p) => p.n === n);
  if (!page) throw new Error("Strana nenalezena");
  if (isMock()) {
    return updateBook(bookId, (b) => {
      b.pages.find((x) => x.n === n)!.text = `${page.text} (upraveno: ${comment})`;
    });
  }
  const prev = book.pages.find((p) => p.n === n - 1 && p.n > 0)?.text ?? "";
  const next = book.pages.find((p) => p.n === n + 1)?.text ?? "";
  const r = await generateText([{ text: pageTextRevisionPrompt(book, page.text, prev, next, comment) }], { temperature: 0.6 });
  return updateBook(bookId, (b) => {
    b.pages.find((x) => x.n === n)!.text = r.text.trim().replace(/^["„]|["“]$/g, "");
    b.usage.push(usage("story", r.usage));
  });
}

/** Převede vyprávění všech stran do minulého času (jedním voláním kvůli jednotnému refrénu). Ilustrace se nemění. */
export async function convertToPastTense(bookId: string) {
  const book = await must(bookId);
  const pages = book.pages.filter((p) => p.text.trim());
  if (!pages.length) throw new Error("Pohádka zatím nemá text.");
  let out: { n: number; text: string }[];
  let u: Usage | null = null;
  if (isMock()) out = pages.map((p) => ({ n: p.n, text: `${p.text} (minulý čas)` }));
  else {
    const r = await generateText([{ text: pastTensePrompt(pages.map((p) => ({ n: p.n, text: p.text }))) }], {
      schema: PAST_TENSE_SCHEMA,
      temperature: 0.2,
    });
    out = JSON.parse(r.text);
    u = r.usage;
  }
  const byN = new Map(out.filter((o) => o?.text?.trim()).map((o) => [o.n, o.text.trim()]));
  return updateBook(bookId, (b) => {
    b.textBackup = {
      at: new Date().toISOString(),
      label: "před převodem do minulého času",
      texts: Object.fromEntries(b.pages.map((p) => [p.n, p.text])),
    };
    for (const p of b.pages) if (byN.has(p.n)) p.text = byN.get(p.n)!;
    if (u) b.usage.push(usage("story", u));
  });
}

/** Vrátí texty stran ze zálohy (před poslední hromadnou úpravou). */
export async function restoreTexts(bookId: string) {
  return updateBook(bookId, (b) => {
    if (!b.textBackup) throw new Error("Není co vracet.");
    for (const p of b.pages) if (b.textBackup.texts[p.n] !== undefined) p.text = b.textBackup.texts[p.n];
    b.textBackup = undefined;
  });
}

export async function editPageImage(bookId: string, n: number, comment: string) {
  const page0 = (await must(bookId)).pages.find((p) => p.n === n);
  const book = await ensureOutfits(bookId, page0?.characters ?? []);
  const page = book.pages.find((p) => p.n === n);
  if (!page) throw new Error("Strana nenalezena");
  if (!page.image) return generatePageImage(bookId, n);
  const chars = page.characters
    .map((id) => book.characters.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c && !!c.sheet);
  const input: InputPart[] = [
    { text: pageImageEditPrompt(book, chars, comment) },
    await img(bookId, page.image),
    ...(await Promise.all(chars.map((c) => img(bookId, c.sheet!)))),
  ];
  const r = await generateImage(input, { aspectRatio: n === 0 ? "4:3" : "4:5", mockLabel: `strana ${n} (upraveno)` });
  const file = await storeGenerated(bookId, `page-${n}`, r.image);
  return updateBook(bookId, (b) => {
    const p = b.pages.find((x) => x.n === n)!;
    p.image = file;
    p.imageVersions = [...(p.imageVersions ?? []), file];
    p.issue = undefined;
    p.checkedAt = undefined;
    b.usage.push(usage("page", r.usage));
  });
}

/** Nakreslí zadané strany: stejné místo postupně (navazující pozadí), různá místa souběžně. */
export async function drawPagesGrouped(bookId: string, ns: number[], onDone: () => Promise<void>) {
  const book = await must(bookId);
  const groups = new Map<string, number[]>();
  for (const n of [...ns].sort((a, b) => a - b)) {
    const loc = book.pages.find((p) => p.n === n)?.location;
    const k = n > 0 && loc ? `loc:${loc}` : `page:${n}`;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  const queue = [...groups.values()];
  await Promise.all(
    Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length) {
        for (const n of queue.shift()!) {
          await generatePageImage(bookId, n);
          await onDone();
        }
      }
    }),
  );
}

/** Označí nakreslené strany, které už neodpovídají předlohám (změna karty, pozadí, scény…). */
export function markStale(b: Book, pred: (p: Page) => boolean) {
  for (const p of b.pages)
    if (p.image && pred(p)) {
      p.stale = true;
      p.issue = undefined;
      p.checkedAt = undefined;
    }
}

/** Které strany ovlivní změna daného pole (pro varování a označení k překreslení). */
export function affectedBy(b: Book, key: string): (p: Page) => boolean {
  const [t, id] = key.split(":");
  if (key === "atmosphere") return () => true;
  if (t === "c") return (p) => p.characters.includes(id);
  if (t === "p") return (p) => p.n === Number(id);
  if (t === "l") return (p) => p.n > 0 && p.location === id;
  return () => false;
}

/** Doplní chybějící / zastaralé české překlady anglických zadání (jedním voláním). */
export async function translateMissing(bookId: string) {
  const book = await must(bookId);
  const items = missingCs(book);
  if (!items.length) return book;
  let out: { key: string; cs: string }[];
  let u: Usage | null = null;
  if (isMock()) out = items.map((i) => ({ key: i.key, cs: `(cz) ${i.en}` }));
  else {
    const r = await generateText([{ text: toCzechPrompt(items) }], { schema: TO_CZECH_SCHEMA, temperature: 0.1 });
    out = JSON.parse(r.text);
    u = r.usage;
  }
  const byKey = new Map(out.map((o) => [o.key, o.cs]));
  return updateBook(bookId, (b) => {
    b.cs ??= {};
    for (const i of items) {
      const cs = byKey.get(i.key);
      // ulož jen když se anglický text mezitím nezměnil
      if (cs && getEn(b, i.key) === i.en) b.cs[i.key] = { en: i.en, cs };
    }
    if (u) b.usage.push(usage("visual", u));
  });
}

/** Rodič upravil českou verzi – přeložíme ji do angličtiny pro Gemini a dotčené strany označíme k překreslení. */
export async function setCzech(bookId: string, key: string, cs: string) {
  const book = await must(bookId);
  const prev = getEn(book, key) ?? "";
  let en: string;
  let u: Usage | null = null;
  if (isMock()) en = `(en) ${cs}`;
  else {
    const r = await generateText([{ text: toEnglishPrompt(cs, prev) }], { temperature: 0.1 });
    en = r.text.trim().replace(/^["„]|["“]$/g, "");
    u = r.usage;
  }
  return updateBook(bookId, (b) => {
    if (!setEn(b, key, en)) throw new Error("Pole nenalezeno");
    b.cs ??= {};
    b.cs[key] = { en, cs };
    markStale(b, affectedBy(b, key));
    if (u) b.usage.push(usage("visual", u));
  });
}

/** AI kontrola nakreslené strany (zdvojené / přebývající / chybějící postavy, anatomie, oblečení). */
export async function inspectPage(bookId: string, n: number) {
  const book = await must(bookId);
  const page = book.pages.find((p) => p.n === n);
  if (!page?.image) throw new Error("Strana nemá ilustraci");
  const chars = page.characters
    .map((id) => book.characters.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const refs: InputPart[] = [];
  for (const c of chars) if (c.sheet) refs.push(await img(bookId, c.sheet));
  const pic = await img(bookId, page.image);
  const res = "image" in pic ? await checkImage(bookId, pic.image, pic.mime, chars, refs) : { ok: true, problem: "", problemCs: "" };
  return updateBook(bookId, (b) => {
    const p = b.pages.find((x) => x.n === n)!;
    p.issue = res.ok ? "" : res.problemCs || res.problem;
    p.checkedAt = new Date().toISOString();
  });
}

/** Opraví obrázek strany podle komentáře (nebo podle nálezu AI kontroly) – úprava, ne nové kreslení. */
export async function fixPage(bookId: string, n: number, comment?: string) {
  const book = await must(bookId);
  const page = book.pages.find((p) => p.n === n);
  if (!page) throw new Error("Strana nenalezena");
  const what = (comment ?? "").trim() || page.issue;
  if (!what) throw new Error("Napiš, co opravit.");
  return editPageImage(bookId, n, what);
}
