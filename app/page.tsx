import Link from "next/link";
import Header from "@/components/Header";
import { listBooks } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const books = await listBooks();
  return (
    <main className="wrap">
      <Header right={<Link className="btn primary" href="/new">+ Nová pohádka</Link>} />
      {books.length === 0 ? (
        <div className="card">
          <p>Zatím tu nejsou žádné pohádky.</p>
          <Link className="btn primary" href="/new">Vytvořit první pohádku</Link>
        </div>
      ) : (
        <div className="grid">
          {books.map((b) => {
            const cover = b.pages.find((p) => p.n === 0)?.image;
            return (
              <Link key={b.id} href={`/books/${b.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
                {cover ? (
                  <img className="thumb wide" src={`/api/files/${b.id}/${cover}`} alt="" />
                ) : (
                  <div className="thumb wide placeholder">bez obálky</div>
                )}
                <strong style={{ display: "block", marginTop: 8 }}>{b.title ?? `Pohádka pro ${b.childName}`}</strong>
                <span className="muted">
                  {new Date(b.createdAt).toLocaleDateString("cs-CZ")} · {b.characters.length} postav · {b.pageCount} stran
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
