import sharp from "sharp";
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
} from "./prompts";
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
export async function storePhoto(bookId: string, data: Buffer) {
  const name = `photo-${newId()}.jpg`;
  const out = await sharp(data).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
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
  const input: InputPart[] = [
    { text: characterSheetPrompt(book, c) },
    ...(await Promise.all(c.photos.map((p) => img(bookId, p)))),
  ];
  const r = await generateImage(input, { aspectRatio: "3:4", mockLabel: c.name });
  const file = await storeGenerated(bookId, `sheet-${cid}`, r.image);
  await updateBook(bookId, (b) => {
    const t = b.characters.find((x) => x.id === cid)!;
    t.sheet = file;
    t.outfit = undefined;
    b.usage.push(usage("sheet", r.usage));
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
  if (isMock()) story = mockStory(book);
  else {
    const r = await generateText([{ text: storyPrompt(book) }], { schema: STORY_SCHEMA, system: STORY_SYSTEM });
    story = JSON.parse(r.text);
    u = r.usage;
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
  });
}

/** Prázdné pozadí místa (bez postav). Vzniká jednou a slouží jako předloha pro všechny strany z toho místa. */
async function ensureLocationPlate(bookId: string, locId: string): Promise<string | undefined> {
  const book = await must(bookId);
  const loc = book.locations?.find((l) => l.id === locId);
  if (!loc) return undefined;
  if (loc.plate && (isMock() || !loc.plate.startsWith("mock-"))) return loc.plate;
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
async function checkImage(bookId: string, image: Buffer, mime: string, chars: Book["characters"]) {
  if (isMock()) return { ok: true, problem: "" };
  try {
    const r = await generateText(
      [{ text: imageCheckPrompt(chars) }, { image, mime }],
      { schema: IMAGE_CHECK_SCHEMA, temperature: 0 },
    );
    await updateBook(bookId, (b) => {
      b.usage.push(usage("visual", r.usage));
    });
    return JSON.parse(r.text) as { ok: boolean; problem: string };
  } catch {
    return { ok: true, problem: "" }; // kontrola je jen pojistka – když selže, obrázek nezahazujeme
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
  const check = await checkImage(bookId, r.image, r.mime, chars);
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
