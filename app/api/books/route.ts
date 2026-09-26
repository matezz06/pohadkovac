import { NextResponse } from "next/server";
import { listBooks, newId, saveBook } from "@/lib/store";
import { storePhoto } from "@/lib/pipeline";
import type { Book, Character } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listBooks());
}

type CharInput = { name: string; role: string; description: string; isHero: boolean };

export async function POST(req: Request) {
  const fd = await req.formData();
  const id = newId();
  const chars: CharInput[] = JSON.parse(String(fd.get("characters") ?? "[]"));
  if (!chars.length) return NextResponse.json({ error: "Přidej aspoň jednu postavu" }, { status: 400 });

  const characters: Character[] = [];
  for (let i = 0; i < chars.length; i++) {
    const photos: string[] = [];
    for (const f of fd.getAll(`photo_${i}`)) {
      if (f instanceof File && f.size > 0) photos.push(await storePhoto(id, Buffer.from(await f.arrayBuffer())));
    }
    characters.push({ id: `c${i + 1}`, ...chars[i], name: chars[i].name.trim(), photos });
  }
  const hero = characters.find((c) => c.isHero) ?? characters[0];
  hero.isHero = true;

  const book: Book = {
    id,
    createdAt: new Date().toISOString(),
    childName: hero.name,
    childAge: Number(fd.get("childAge") ?? 3),
    styleId: String(fd.get("styleId") ?? "watercolor"),
    customStyle: String(fd.get("customStyle") ?? "") || undefined,
    theme: String(fd.get("theme") ?? ""),
    lesson: String(fd.get("lesson") ?? "") || undefined,
    pageCount: Math.min(20, Math.max(3, Number(fd.get("pageCount") ?? 10))),
    textLength: (["short", "medium", "long"].includes(String(fd.get("textLength"))) ? String(fd.get("textLength")) : "medium") as Book["textLength"],
    language: "cs",
    characters,
    pages: [],
    usage: [],
  };
  await saveBook(book);
  return NextResponse.json({ id });
}
