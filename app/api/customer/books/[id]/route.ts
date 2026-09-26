import { NextResponse } from "next/server";
import { loadBook, updateBook } from "@/lib/store";
import { startJob, isRunning } from "@/lib/jobs";
import {
  assignLocations,
  drawPagesGrouped,
  editPageImage,
  generateStory,
  reviseCharacter,
  revisePageText,
} from "@/lib/pipeline";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Kroky zákaznického průběhu. Všechna omezení hlídá server:
 *  - komentáře ke kartám postav jen jednou
 *  - vlna úprav stran jen jednou, pak je knížka uzamčená
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const book = await loadBook(id);
  if (!book?.customer) return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
  if (isRunning(id)) return bad("Na knížce se právě pracuje, počkej na dokončení.");
  const body = await req.json();

  try {
    switch (body.step) {
      // 1a) komentáře ke kartám postav (jednou)
      case "cardComments": {
        if (book.status !== "cards") return bad("Postavy už jsou schválené.");
        if (book.cardsRevisionUsed) return bad("Úpravu postav už jsi využil(a).");
        const comments: Record<string, string> = body.comments ?? {};
        const todo = book.characters.filter((c) => comments[c.id]?.trim());
        if (!todo.length) return bad("Napiš aspoň jeden komentář.");
        await updateBook(id, (b) => {
          b.cardsRevisionUsed = true;
          for (const c of b.characters) if (comments[c.id]?.trim()) c.comment = comments[c.id].trim().slice(0, 500);
        });
        await startJob(id, "cardsRevision", "Upravuji postavičky", todo.length, async (tick) => {
          for (const c of todo) {
            await reviseCharacter(id, c.id, comments[c.id].trim());
            await tick();
          }
        });
        break;
      }
      // 1b) schválení postav → příběh + ilustrace
      case "approveCards": {
        if (book.status !== "cards") return bad("Postavy už jsou schválené.");
        if (book.characters.some((c) => !c.sheet)) return bad("Některá postavička ještě není nakreslená.");
        await updateBook(id, (b) => {
          b.status = "book";
        });
        await startJob(id, "book", "Píšu a kreslím pohádku", book.pageCount + 3, async (tick) => {
          await generateStory(id);
          await tick();
          await assignLocationsIfMissing(id);
          await tick();
          const b = (await loadBook(id))!;
          await drawPagesGrouped(id, b.pages.map((p) => p.n), tick);
        });
        break;
      }
      // 2) vlna úprav stran (jednou) → uzamčení
      case "revision": {
        if (book.status !== "book") return bad("Knížka není ve fázi úprav.");
        if (book.revisionUsed) return bad("Úpravy už jsi využil(a).");
        const pages: Record<string, { text?: string; image?: string }> = body.pages ?? {};
        const todo = book.pages
          .map((p) => ({ n: p.n, text: pages[p.n]?.text?.trim().slice(0, 500), image: pages[p.n]?.image?.trim().slice(0, 500) }))
          .filter((x) => x.text || x.image);
        await updateBook(id, (b) => {
          b.revisionUsed = true;
          for (const x of todo) {
            const p = b.pages.find((q) => q.n === x.n)!;
            p.textComment = x.text;
            p.imageComment = x.image;
          }
          if (!todo.length) b.status = "final";
        });
        if (!todo.length) break;
        const total = todo.reduce((s, x) => s + (x.text ? 1 : 0) + (x.image ? 1 : 0), 0);
        await startJob(id, "revision", "Zapracovávám úpravy", total, async (tick) => {
          for (const x of todo) {
            if (x.text) {
              if (x.n === 0) {
                await updateBook(id, (b) => {
                  b.title = x.text!;
                  b.pages.find((p) => p.n === 0)!.text = x.text!;
                });
              } else await revisePageText(id, x.n, x.text);
              await tick();
            }
            if (x.image) {
              await editPageImage(id, x.n, x.image);
              await tick();
            }
          }
          await updateBook(id, (b) => {
            b.status = "final";
          });
        });
        break;
      }
      // zopakování kroku, který spadl na chybě (nepočítá se jako pokus)
      case "retry": {
        if (!book.job?.error) return bad("Není co opakovat.");
        const missing = book.pages.filter((p) => !p.image).map((p) => p.n);
        if (book.status === "cards") {
          const todo = book.characters.filter((c) => !c.sheet);
          await startJob(id, "cards", "Kreslím postavičky", todo.length, async (tick) => {
            const { describeCharacter, generateSheet } = await import("@/lib/pipeline");
            for (const c of todo) {
              await describeCharacter(id, c.id);
              await generateSheet(id, c.id);
              await tick();
            }
          });
        } else if (book.status === "book" && (!book.pages.length || missing.length)) {
          await startJob(id, "book", "Dokončuji pohádku", (book.pages.length ? missing.length : book.pageCount + 1) + 1, async (tick) => {
            if (!book.pages.length) {
              await generateStory(id);
              await assignLocationsIfMissing(id);
            }
            await tick();
            const b = (await loadBook(id))!;
            await drawPagesGrouped(id, b.pages.filter((p) => !p.image).map((p) => p.n), tick);
          });
        } else {
          await updateBook(id, (b) => {
            b.job = null;
            if (b.revisionUsed) b.status = "final";
          });
        }
        break;
      }
      default:
        return bad("Neznámý krok");
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return NextResponse.json(await loadBook(id));
}

async function assignLocationsIfMissing(id: string) {
  const b = await loadBook(id);
  if (b && !(b.locations?.length)) await assignLocations(id);
}
