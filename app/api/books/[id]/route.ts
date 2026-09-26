import { NextResponse } from "next/server";
import { deleteBook, loadBook, updateBook } from "@/lib/store";
import type { Book } from "@/lib/types";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const book = await loadBook((await params).id);
  return book ? NextResponse.json(book) : NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
}

/** Ruční úpravy: název, texty/scény stran, popisy postav, výběr verze obrázku, styl. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const patch = (await req.json()) as Partial<Book> & {
    page?: { n: number; text?: string; scene?: string; characters?: string[]; image?: string };
    character?: { id: string; visual?: string; description?: string; name?: string; role?: string; sheet?: string };
  };
  const book = await updateBook(id, (b) => {
    if (patch.title !== undefined) b.title = patch.title;
    if (patch.styleId !== undefined) b.styleId = patch.styleId;
    if (patch.customStyle !== undefined) b.customStyle = patch.customStyle;
    if (patch.theme !== undefined) b.theme = patch.theme;
    if (patch.lesson !== undefined) b.lesson = patch.lesson;
    if (patch.pageCount !== undefined) b.pageCount = patch.pageCount;
    if (patch.page) {
      const p = b.pages.find((x) => x.n === patch.page!.n);
      if (p) {
        const { n, ...rest } = patch.page;
        if (rest.image && !(p.imageVersions ?? []).includes(rest.image)) delete rest.image;
        Object.assign(p, rest);
        if (n === 0 && rest.text !== undefined) b.title = rest.text;
      }
    }
    if (patch.character) {
      const c = b.characters.find((x) => x.id === patch.character!.id);
      if (c) {
        const { id: _, ...rest } = patch.character;
        Object.assign(c, rest);
      }
    }
  });
  return NextResponse.json(book);
}

export async function DELETE(_: Request, { params }: Ctx) {
  await deleteBook((await params).id);
  return NextResponse.json({ ok: true });
}
