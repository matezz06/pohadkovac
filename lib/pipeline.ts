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
  return updateBook(bookId, (b) => {
    b.characters.find((x) => x.id === cid)!.sheet = file;
    b.usage.push(usage("sheet", r.usage));
  });
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
    b.locations = story.locations ?? [];
    const locIds = new Set(b.locations.map((l) => l.id));
    const cover: Page = { n: 0, text: story.title, scene: story.coverScene, characters: clean(story.coverCharacters) };
    b.pages = [cover, ...story.pages.map((p, i) => ({ n: i + 1, text: p.text, scene: p.scene, characters: clean(p.characters), location: p.location && locIds.has(p.location) ? p.location : undefined }))];
    if (u) b.usage.push(usage("story", u));
  });
}

export async function generatePageImage(bookId: string, n: number) {
  const book = await must(bookId);
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
  // Pozadí: předchozí nakreslená strana ze stejného místa slouží jako předloha prostředí.
  const location = book.locations?.find((l) => l.id === page.location);
  let envRef: InputPart | null = null;
  if (n > 0 && page.location) {
    const prev = book.pages
      .filter((p) => p.n > 0 && p.n < n && p.location === page.location && p.image && (isMock() || !p.image.startsWith("mock-")))
      .sort((a, b) => b.n - a.n)[0];
    if (prev?.image) envRef = await img(bookId, prev.image);
  }
  const input: InputPart[] = [
    { text: pageImagePrompt(book, page.scene, chars, n === 0, location, !!envRef) },
    ...refs,
    ...(envRef ? [envRef] : []),
  ];
  const r = await generateImage(input, { aspectRatio: n === 0 ? "4:3" : "4:5", mockLabel: n === 0 ? "obálka" : `strana ${n}` });
  const file = await storeGenerated(bookId, `page-${n}`, r.image);
  return updateBook(bookId, (b) => {
    const p = b.pages.find((x) => x.n === n)!;
    p.image = file;
    p.imageVersions = [...(p.imageVersions ?? []), file];
    b.usage.push(usage("page", r.usage));
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
    b.locations = res.locations;
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
