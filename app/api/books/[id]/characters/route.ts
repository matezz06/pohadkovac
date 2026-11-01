import { NextResponse } from "next/server";
import { loadBook, updateBook } from "@/lib/store";
import { markStale, storePhoto } from "@/lib/pipeline";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/**
 * Přidání postavy do rozpracované pohádky, nebo výměna fotek existující postavy (pole cid).
 * multipart: name, role, description, photos[] (+ cid pro výměnu fotek)
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const fd = await req.formData();
  const book = await loadBook(id);
  if (!book) return NextResponse.json({ error: "Knížka nenalezena" }, { status: 404 });
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 3);
  const photos: string[] = [];
  for (const f of files) photos.push(await storePhoto(id, Buffer.from(await f.arrayBuffer())));
  const cid = String(fd.get("cid") ?? "");

  try {
    const updated = await updateBook(id, (b) => {
      if (cid) {
        const c = b.characters.find((x) => x.id === cid);
        if (!c) throw new Error("Postava nenalezena");
        if (!photos.length) throw new Error("Vyber aspoň jednu fotku");
        c.photos = photos;
        c.visual = undefined; // popis vzhledu vznikne znovu z nových fotek při kreslení karty
        return;
      }
      const name = String(fd.get("name") ?? "").trim();
      if (!name) throw new Error("Vyplň jméno postavy");
      const next = Math.max(0, ...b.characters.map((c) => Number(c.id.replace(/\D/g, "")) || 0)) + 1;
      b.characters.push({
        id: `c${next}`,
        name,
        role: String(fd.get("role") ?? "").trim(),
        description: String(fd.get("description") ?? "").trim(),
        isHero: false,
        photos,
      });
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

/** Odebrání vedlejší postavy – zmizí i ze stran, kde vystupovala (ty se označí k překreslení). */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const cid = new URL(req.url).searchParams.get("cid") ?? "";
  try {
    const updated = await updateBook(id, (b) => {
      const c = b.characters.find((x) => x.id === cid);
      if (!c) throw new Error("Postava nenalezena");
      if (c.isHero) throw new Error("Hlavního hrdinu nejde odebrat");
      markStale(b, (p) => p.characters.includes(cid));
      for (const p of b.pages) p.characters = p.characters.filter((x) => x !== cid);
      b.characters = b.characters.filter((x) => x.id !== cid);
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
