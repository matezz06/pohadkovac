import Link from "next/link";
import { notFound } from "next/navigation";
import { loadBook } from "@/lib/store";
import PrintButton from "./PrintButton";
import "./read.css";

export const dynamic = "force-dynamic";

export default async function Read({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await loadBook(id);
  if (!book) notFound();
  const src = (n?: string) => (n ? `/api/files/${id}/${n}` : undefined);
  const cover = book.pages.find((p) => p.n === 0);
  const pages = book.pages.filter((p) => p.n > 0);

  return (
    <main className="reader">
      <div className="toolbar no-print">
        <Link className="btn" href={`/books/${id}`}>← Upravit</Link>
        <PrintButton />
        <span className="muted">Tip: v dialogu tisku zvol „Uložit jako PDF“, orientace na šířku, bez okrajů.</span>
      </div>

      <section className="sheet cover">
        {cover?.image && <img src={src(cover.image)} alt="" />}
        <h1>{book.title}</h1>
      </section>

      {pages.map((p) => (
        <section className="sheet" key={p.n}>
          <div className="art">{p.image ? <img src={src(p.image)} alt="" /> : <div className="missing">bez ilustrace</div>}</div>
          <div className="text"><p>{p.text}</p><span className="num">{p.n}</span></div>
        </section>
      ))}

      <section className="sheet end">
        <p>Konec</p>
        <p className="muted">♥ {book.childName}</p>
      </section>
    </main>
  );
}
