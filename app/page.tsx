import Link from "next/link";
import Header from "@/components/Header";
import { listBooks } from "@/lib/store";
import { costCzk } from "@/lib/pricing";

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
              <Link key={b.id} href={b.customer ? `/b/${b.id}` : `/books/${b.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
                {cover ? (
                  <img className="thumb wide" src={`/api/files/${b.id}/${cover}`} alt="" />
                ) : (
                  <div className="thumb wide placeholder">bez obálky</div>
                )}
                <strong style={{ display: "block", marginTop: 8 }}>{b.title ?? `Pohádka pro ${b.childName}`}</strong>
                <span className="muted">
                  {b.customer && <span className="pill">zákazník · {b.status}</span>}{" "}
                  {new Date(b.createdAt).toLocaleDateString("cs-CZ")} · {b.pageCount} stran · náklad ≈ {costCzk(b.usage).toFixed(1)} Kč
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
