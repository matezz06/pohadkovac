"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import type { Book, Page } from "@/lib/types";

const f = (id: string, name?: string) => (name ? `/api/files/${id}/${name}` : undefined);

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(size, q.length) }, async () => { while (q.length) await fn(q.shift()!); }));
}

export default function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const [book, setBook] = useState<Book | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const autoStarted = useRef(false);
  const [mock, setMock] = useState(false);
  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then((s) => setMock(!!s.mock)); }, []);
  // v ostrém režimu ber zástupné (mock) obrázky jako chybějící
  const isMissing = useCallback((f?: string) => !f || (!mock && f.startsWith("mock-")), [mock]);

  const load = useCallback(async () => {
    const r = await fetch(`/api/books/${id}`);
    if (r.ok) setBook(await r.json());
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = useCallback(async (key: string, body: object): Promise<Book | null> => {
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      const r = await fetch(`/api/books/${id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setBook(j);
      return j;
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : String(e) }));
      return null;
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }, [id]);

  const patch = useCallback(async (body: object) => {
    const r = await fetch(`/api/books/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) setBook(await r.json());
  }, [id]);

  const runAll = useCallback(async (b: Book) => {
    const missingSheets = b.characters.filter((c) => isMissing(c.sheet));
    if (missingSheets.length) {
      setStatus(`Kreslím karty postav (${missingSheets.length})…`);
      await pool(missingSheets, 2, async (c) => { await act(`sheet-${c.id}`, { action: "sheet", cid: c.id }); });
    }
    let cur = b;
    if (!cur.pages.length) {
      setStatus("Píšu příběh…");
      const r = await act("story", { action: "story" });
      if (!r) return setStatus("");
      cur = r;
    }
    const missing = cur.pages.filter((p) => isMissing(p.image));
    let done = 0;
    setStatus(`Kreslím ilustrace 0/${missing.length}…`);
    await pool(missing, 2, async (p) => {
      await act(`page-${p.n}`, { action: "page", n: p.n });
      setStatus(`Kreslím ilustrace ${++done}/${missing.length}…`);
    });
    setStatus("");
    load();
  }, [act, load, isMissing]);

  useEffect(() => {
    if (book && search.get("auto") === "1" && !autoStarted.current) {
      autoStarted.current = true;
      router.replace(`/books/${id}`);
      runAll(book);
    }
  }, [book, search, runAll, router, id]);

  if (!book) return <main className="wrap"><Header /><p>Načítám…</p></main>;

  const anyBusy = Object.values(busy).some(Boolean);
  const images = book.usage.reduce((s, u) => s + u.images, 0);
  const tokIn = book.usage.reduce((s, u) => s + u.inputTokens, 0);
  const tokOut = book.usage.reduce((s, u) => s + u.outputTokens, 0);

  return (
    <main className="wrap">
      <Header right={<>
        <button className="primary" disabled={anyBusy} onClick={() => runAll(book)}>Dogenerovat vše</button>
        <Link className="btn" href={`/books/${id}/read`}>Číst / tisk PDF</Link>
      </>} />
      {status && <div className="progress"><span className="spin" /> {status}</div>}

      <input
        defaultValue={book.title ?? ""}
        placeholder="Název pohádky (vznikne s příběhem)"
        onBlur={(e) => e.target.value !== (book.title ?? "") && patch({ page: { n: 0, text: e.target.value }, title: e.target.value })}
        style={{ fontFamily: "Georgia, serif", fontSize: 26, border: "none", background: "transparent", padding: 0 }}
      />
      <p className="muted">
        Spotřeba: {images} obrázků · {tokIn.toLocaleString("cs-CZ")} vstupních / {tokOut.toLocaleString("cs-CZ")} výstupních tokenů
      </p>

      <h2>1. Karty postav</h2>
      <p className="muted">Stylizované předlohy – podle nich se kreslí každá strana. Když se nepovede, uprav popis vzhledu a vygeneruj znovu.</p>
      <div className="grid">
        {book.characters.map((c) => (
          <div className="card stack" key={c.id}>
            {c.sheet ? <img className="thumb" src={f(id, c.sheet)} alt={c.name} /> : <div className="thumb placeholder">{busy[`sheet-${c.id}`] ? <span className="spin" /> : "zatím bez karty"}</div>}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{c.isHero && "⭐ "}{c.name}</strong>
              <span className="pill">{c.role}</span>
            </div>
            <div className="photos">{c.photos.map((p) => <img key={p} src={f(id, p)} alt="" />)}</div>
            <label>Vzhled (pro ilustrátora, anglicky)
              <textarea
                defaultValue={c.visual ?? ""}
                key={c.visual}
                placeholder="vyplní se automaticky z fotek"
                onBlur={(e) => e.target.value !== (c.visual ?? "") && patch({ character: { id: c.id, visual: e.target.value } })}
              />
            </label>
            <div className="row">
              <button className="small" disabled={busy[`sheet-${c.id}`]} onClick={() => act(`sheet-${c.id}`, { action: "sheet", cid: c.id })}>
                {c.sheet ? "↻ Nová karta" : "Nakreslit kartu"}
              </button>
              <button className="small" disabled={busy[`describe-${c.id}`] || !c.photos.length} onClick={() => act(`describe-${c.id}`, { action: "describe", cid: c.id })}>
                Popsat z fotek
              </button>
            </div>
            {(errors[`sheet-${c.id}`] || errors[`describe-${c.id}`]) && <p className="err">{errors[`sheet-${c.id}`] || errors[`describe-${c.id}`]}</p>}
          </div>
        ))}
      </div>

      <h2>2. Příběh a ilustrace</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <button disabled={busy.story} onClick={() => confirm(book.pages.length ? "Přepsat celý příběh? Ilustrace se smažou." : "Napsat příběh?") && act("story", { action: "story" })}>
          {busy.story ? <><span className="spin" /> Píšu…</> : book.pages.length ? "↻ Napsat příběh znovu" : "Napsat příběh"}
        </button>
        {errors.story && <span className="err">{errors.story}</span>}
      </div>
      <div className="stack">
        {book.pages.map((p) => (
          <PageEditor key={p.n} book={book} page={p} busy={!!busy[`page-${p.n}`]} error={errors[`page-${p.n}`]}
            onGenerate={() => act(`page-${p.n}`, { action: "page", n: p.n })}
            onPatch={(x) => patch({ page: { n: p.n, ...x } })} />
        ))}
      </div>

      <p style={{ marginTop: 40 }}>
        <button className="small" onClick={async () => { if (confirm("Opravdu smazat celou pohádku včetně fotek?")) { await fetch(`/api/books/${id}`, { method: "DELETE" }); router.push("/"); } }}>
          Smazat pohádku
        </button>
      </p>
    </main>
  );
}

function PageEditor({ book, page, busy, error, onGenerate, onPatch }: {
  book: Book; page: Page; busy: boolean; error?: string;
  onGenerate: () => void; onPatch: (x: Partial<Page>) => void;
}) {
  const id = book.id;
  return (
    <div className={`card page-row${page.n === 0 ? "" : " narrow"}`}>
      <div className="stack">
        {page.image ? <img className={page.n === 0 ? "thumb wide" : "thumb portrait"} src={f(id, page.image)} alt="" /> : <div className={`${page.n === 0 ? "thumb wide" : "thumb portrait"} placeholder`}>{busy ? <span className="spin" /> : "bez ilustrace"}</div>}
        {(page.imageVersions?.length ?? 0) > 1 && (
          <div className="versions">
            {page.imageVersions!.map((v) => (
              <img key={v} src={f(id, v)} alt="" className={v === page.image ? "active" : ""} onClick={() => onPatch({ image: v })} title="Použít tuto verzi" />
            ))}
          </div>
        )}
        <div className="row">
          <button className="small" disabled={busy} onClick={onGenerate}>{busy ? <><span className="spin" /> Kreslím…</> : page.image ? "↻ Nakreslit znovu" : "Nakreslit"}</button>
        </div>
        {error && <p className="err">{error}</p>}
      </div>
      <div className="stack">
        <strong>{page.n === 0 ? "Obálka" : `Strana ${page.n}`}</strong>
        <label>{page.n === 0 ? "Název" : "Text"}
          <textarea key={page.text} defaultValue={page.text} rows={page.n === 0 ? 1 : 4} onBlur={(e) => e.target.value !== page.text && onPatch({ text: e.target.value })} />
        </label>
        <label>Scéna pro ilustraci (anglicky)
          <textarea key={page.scene} defaultValue={page.scene} rows={3} onBlur={(e) => e.target.value !== page.scene && onPatch({ scene: e.target.value })} />
        </label>
        <div className="checks">
          {book.characters.map((c) => (
            <label key={c.id}>
              <input type="checkbox" checked={page.characters.includes(c.id)}
                onChange={(e) => onPatch({ characters: e.target.checked ? [...page.characters, c.id] : page.characters.filter((x) => x !== c.id) })} />
              {c.name}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
