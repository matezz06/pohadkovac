import { NextResponse } from "next/server";
import { newId, saveBook } from "@/lib/store";
import { describeCharacter, generateSheet, storePhoto } from "@/lib/pipeline";
import { getPackage } from "@/lib/packages";
import { startJob } from "@/lib/jobs";
import type { Book, Character } from "@/lib/types";

export const runtime = "nodejs";

type CharInput = { name: string; role: string; description: string; isHero: boolean };

/** Zákaznická objednávka: balíček určuje počet stran, délku textu a max. počet postav. */
export async function POST(req: Request) {
  const fd = await req.formData();
  const pkg = getPackage(String(fd.get("packageId")));
  if (!pkg) return NextResponse.json({ error: "Vyber balíček" }, { status: 400 });
  const chars: CharInput[] = JSON.parse(String(fd.get("characters") ?? "[]"));
  if (!chars.length) return NextResponse.json({ error: "Přidej aspoň hlavního hrdinu" }, { status: 400 });
  if (chars.length > pkg.maxCharacters)
    return NextResponse.json({ error: `Balíček ${pkg.label} umožňuje max. ${pkg.maxCharacters} postavy` }, { status: 400 });
  if (fd.get("consent") !== "1")
    return NextResponse.json({ error: "Je potřeba souhlas se zpracováním fotek" }, { status: 400 });

  const id = newId();
  const characters: Character[] = [];
  for (let i = 0; i < chars.length; i++) {
    const photos: string[] = [];
    for (const f of fd.getAll(`photo_${i}`).slice(0, 3)) {
      if (f instanceof File && f.size > 0) photos.push(await storePhoto(id, Buffer.from(await f.arrayBuffer())));
    }
    if (!photos.length) return NextResponse.json({ error: `Postava „${chars[i].name}“ nemá fotku` }, { status: 400 });
    characters.push({ id: `c${i + 1}`, ...chars[i], name: chars[i].name.trim(), isHero: i === 0, photos });
  }

  const book: Book = {
    id,
    createdAt: new Date().toISOString(),
    childName: characters[0].name,
    childAge: Math.min(10, Math.max(1, Number(fd.get("childAge") ?? 3))),
    styleId: String(fd.get("styleId") ?? "watercolor"),
    theme: String(fd.get("theme") ?? "").slice(0, 1000),
    lesson: String(fd.get("lesson") ?? "").slice(0, 300) || undefined,
    pageCount: pkg.pages,
    textLength: pkg.textLength,
    language: "cs",
    characters,
    pages: [],
    usage: [],
    customer: true,
    packageId: pkg.id,
    priceCzk: pkg.priceCzk,
    status: "cards",
  };
  await saveBook(book);

  await startJob(id, "cards", "Kreslím postavičky", characters.length, async (tick) => {
    const queue = [...characters];
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        while (queue.length) {
          const c = queue.shift()!;
          await describeCharacter(id, c.id);
          await generateSheet(id, c.id);
          await tick();
        }
      }),
    );
  });
  return NextResponse.json({ id });
}
