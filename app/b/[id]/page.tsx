"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Book } from "@/lib/types";

const f = (id: string, name?: string) => (name ? `/api/files/${id}/${name}` : undefined);

/** Zákaznický průběh: postavy → pohádka → jedna vlna úprav → hotovo. */
export default function CustomerBook({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [book, setBook] = useState<Book | null>(null);
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [cardComments, setCardComments] = useState<Record<string, string>>({});
  const [pageComments, setPageComments] = useState<Record<number, { text?: string; image?: string }>>({});

  const load = useCallback(async () => {
    const r = await fetch(`/api/books/${id}`, { cache: "no-store" });
    if (r.ok) setBook(await r.json());
  }, [id]);

  useEffect(() => { load(); }, [load]);
  // dokud běží generování, obnovuj stav
  useEffect(() => {
    if (!book?.job || book.job.error) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [book?.job, load]);

  async function step(body: object, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setSending(true);
    setErr("");
    const r = await fetch(`/api/customer/books/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setSending(false);
    if (!r.ok) return setErr(j.error ?? "Chyba");
    setBook(j);
  }

  if (!book) return <main className="wrap"><p>Načítám…</p></main>;
  if (!book.customer) return <main className="wrap"><p>Tato knížka není zákaznická. <Link href={`/books/${id}`}>Otevřít v editoru</Link></p></main>;

  const job = book.job;
  const working = !!job && !job.error;
  const status = book.status ?? "cards";
  const order = ["cards", "book", "final"];
  const stepClass = (s: string) => (s === status ? "on" : order.indexOf(s) < order.indexOf(status) ? "done" : "");
  const hasPageComments = Object.values(pageComments).some((x) => x.text?.trim() || x.image?.trim());

  return (
    <main className="wrap">
      <header className="top"><h1>📖 {book.title ?? `Pohádka pro ${book.childName}`}</h1></header>
      <div className="steps">
        <span className={stepClass("cards")}>1. Postavičky</span>
        <span className={stepClass("book")}>2. Pohádka a úpravy</span>
        <span className={stepClass("final")}>3. Hotovo</span>
      </div>

      {job && (
        <div className="card" style={{ marginBottom: 16 }}>
          {job.error ? (
            <>
              <p className="err">Něco se nepovedlo: {job.error}</p>
              <button onClick={() => step({ step: "retry" })} disabled={sending}>Zkusit znovu</button>
            </>
          ) : (
            <>
              <span className="spin" /> <strong>{job.label}…</strong> <span className="muted">{job.done}/{job.total} · může to trvat pár minut, stránku můžete nechat otevřenou</span>
              <div className="bar"><div style={{ width: `${Math.round((job.done / Math.max(1, job.total)) * 100)}%` }} /></div>
            </>
          )}
        </div>
      )}
      {err && <p className="err">{err}</p>}

      {/* ---------- 1. POSTAVY ---------- */}
      {status === "cards" && (
        <>
          <p>Takhle budou postavy vypadat v celé knížce. {book.cardsRevisionUsed
            ? "Úpravu postav jste už využili – pokud jsou v pořádku, pokračujte."
            : "Pokud něco nesedí, napište k postavě připomínku (lze jednou). Jinak rovnou pokračujte."}</p>
          <div className="grid">
            {book.characters.map((c) => (
              <div className="card stack" key={c.id}>
                {c.sheet ? <img className="thumb" src={f(id, c.sheet)} alt={c.name} /> : <div className="thumb placeholder"><span className="spin" /></div>}
                <strong>{c.isHero && "⭐ "}{c.name}</strong>
                {c.comment && <p className="muted" style={{ margin: 0 }}>Vaše připomínka: {c.comment}</p>}
                {!book.cardsRevisionUsed && (
                  <textarea placeholder="Např. vlasy jsou tmavší a rovné" maxLength={500} disabled={working}
                    value={cardComments[c.id] ?? ""} onChange={(e) => setCardComments({ ...cardComments, [c.id]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            {!book.cardsRevisionUsed && (
              <button disabled={working || sending || !Object.values(cardComments).some((x) => x.trim())}
                onClick={() => step({ step: "cardComments", comments: cardComments }, "Odeslat připomínky? Úpravu postav lze udělat jen jednou.")}>
                Upravit postavy podle připomínek
              </button>
            )}
            <button className="primary" disabled={working || sending || book.characters.some((c) => !c.sheet)}
              onClick={() => step({ step: "approveCards" }, "Postavy jsou v pořádku? Pak už je měnit nepůjde a začne vznikat pohádka.")}>
              Postavy jsou v pořádku → vytvořit pohádku
            </button>
          </div>
        </>
      )}

      {/* ---------- 2. POHÁDKA + VLNA ÚPRAV ---------- */}
      {status === "book" && (
        <>
          {!working && !book.revisionUsed && book.pages.length > 0 && (
            <div className="notice" style={{ marginBottom: 16 }}>
              <strong>Máte jednu možnost úprav.</strong> Ke kterékoli straně napište připomínku k textu nebo k obrázku
              a odešlete vše najednou. Strany bez připomínky zůstanou, jak jsou. Po zapracování bude knížka uzavřená.
            </div>
          )}
          <div className="stack">
            {book.pages.map((p) => (
              <div className={`card page-row${p.n === 0 ? "" : " narrow"}`} key={p.n}>
                <div>{p.image ? <img className={p.n === 0 ? "thumb wide" : "thumb portrait"} src={f(id, p.image)} alt="" /> : <div className={`${p.n === 0 ? "thumb wide" : "thumb portrait"} placeholder`}><span className="spin" /></div>}</div>
                <div className="stack">
                  <strong>{p.n === 0 ? "Obálka" : `Strana ${p.n}`}</strong>
                  <p style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 18 }}>{p.text}</p>
                  {!book.revisionUsed && !working && (
                    <>
                      <label>{p.n === 0 ? "Jiný název" : "Připomínka k textu"}
                        <textarea rows={2} maxLength={500} value={pageComments[p.n]?.text ?? ""}
                          placeholder={p.n === 0 ? "Napište nový název" : "Např. ať tam Pája řekne něco vtipného"}
                          onChange={(e) => setPageComments({ ...pageComments, [p.n]: { ...pageComments[p.n], text: e.target.value } })} />
                      </label>
                      <label>Připomínka k obrázku
                        <textarea rows={2} maxLength={500} value={pageComments[p.n]?.image ?? ""} placeholder="Např. pes nemá mít obojek"
                          onChange={(e) => setPageComments({ ...pageComments, [p.n]: { ...pageComments[p.n], image: e.target.value } })} />
                      </label>
                    </>
                  )}
                  {(p.textComment || p.imageComment) && (
                    <p className="muted" style={{ margin: 0 }}>Připomínky: {[p.textComment, p.imageComment].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!book.revisionUsed && !working && book.pages.length > 0 && (
            <div className="row" style={{ marginTop: 16 }}>
              <button disabled={sending || !hasPageComments}
                onClick={() => step({ step: "revision", pages: pageComments }, "Odeslat připomínky? Další úpravy už nebudou možné.")}>
                Odeslat připomínky (jediná možnost)
              </button>
              <button className="primary" disabled={sending}
                onClick={() => step({ step: "revision", pages: {} }, "Dokončit knížku bez úprav?")}>
                Je to perfektní → dokončit
              </button>
            </div>
          )}
        </>
      )}

      {/* ---------- 3. HOTOVO ---------- */}
      {status === "final" && (
        <div className="card stack">
          <p style={{ margin: 0 }}>🎉 Pohádka je hotová. Můžete si ji přečíst nebo uložit jako PDF k tisku.</p>
          <div><Link className="btn primary" href={`/books/${id}/read`}>Číst / uložit PDF</Link></div>
        </div>
      )}
    </main>
  );
}
