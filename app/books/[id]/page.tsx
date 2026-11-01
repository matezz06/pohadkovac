"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import type { Book, Page, TextLength } from "@/lib/types";
import { PLACE_COUNTS, TEXT_LENGTHS, maxChars } from "@/lib/prompts";
import { costCzk, formatCzk, imageCzk, remainingCzk } from "@/lib/pricing";
import { csText, missingCs } from "@/lib/czech";
import { normalizePhotos } from "@/lib/photoFiles";
import PhotoThumb from "@/components/PhotoThumb";

const f = (id: string, name?: string) => (name ? `/api/files/${id}/${name}` : undefined);

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(size, q.length) }, async () => { while (q.length) await fn(q.shift()!); }));
}

const STEPS = ["Postavy", "Příběh", "Prostředí", "Ilustrace"];
/** „1 stranu / 2 strany / 5 stran“ – 4. pád (bude potřeba překreslit X, opravit X) */
const plural = (n: number) => (n === 1 ? "stranu" : n >= 2 && n <= 4 ? "strany" : "stran");

/** Nejdál odemčený krok – u starších knížek ho odvodíme z toho, co už je hotové. */
function stageOf(b: Book) {
  if (b.stage) return b.stage;
  if (b.pages.some((p) => p.image)) return 4;
  if (b.locations?.some((l) => l.plate)) return 3;
  if (b.pages.length) return 2;
  return 1;
}

type Act = (key: string, body: object) => Promise<Book | null>;

export default function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const [book, setBook] = useState<Book | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [view, setView] = useState<number | null>(null);
  const autoStarted = useRef(false);
  const translateTried = useRef("");
  const [mock, setMock] = useState(false);
  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then((s) => setMock(!!s.mock)); }, []);
  // v ostrém režimu ber zástupné (mock) obrázky jako chybějící
  const isMissing = useCallback((f?: string) => !f || (!mock && f.startsWith("mock-")), [mock]);

  const load = useCallback(async () => {
    const r = await fetch(`/api/books/${id}`);
    if (r.ok) setBook(await r.json());
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act: Act = useCallback(async (key, body) => {
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

  /** Strany ze stejného místa kreslí postupně (každá navazuje pozadím na předchozí), různá místa souběžně. */
  const drawPages = useCallback(async (pages: Page[]) => {
    if (!pages.length) return;
    const groups = new Map<string, Page[]>();
    for (const p of [...pages].sort((a, c) => a.n - c.n)) {
      const k = p.n > 0 && p.location ? `loc:${p.location}` : `page:${p.n}`;
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    let done = 0;
    setStatus(`Kreslím ilustrace 0/${pages.length}…`);
    await pool([...groups.values()], 2, async (g) => {
      for (const p of g) {
        await act(`page-${p.n}`, { action: "page", n: p.n });
        setStatus(`Kreslím ilustrace ${++done}/${pages.length}…`);
      }
    });
    setStatus("");
    load();
  }, [act, load]);

  const drawSheets = useCallback(async (b: Book) => {
    const missing = b.characters.filter((c) => isMissing(c.sheet));
    if (!missing.length) return;
    setStatus(`Kreslím karty postav (${missing.length})…`);
    await pool(missing, 2, async (c) => { await act(`sheet-${c.id}`, { action: "sheet", cid: c.id }); });
    setStatus("");
  }, [act, isMissing]);

  const drawPlates = useCallback(async (b: Book) => {
    const missing = (b.locations ?? []).filter((l) => isMissing(l.plate));
    if (!missing.length) return;
    setStatus(`Kreslím pozadí míst (${missing.length})…`);
    await pool(missing, 2, async (l) => { await act(`plate-${l.id}`, { action: "plate", lid: l.id }); });
    setStatus("");
  }, [act, isMissing]);

  // po založení pohádky se rovnou kreslí jen karty postav (krok 1)
  useEffect(() => {
    if (book && search.get("auto") === "1" && !autoStarted.current) {
      autoStarted.current = true;
      router.replace(`/books/${id}`);
      drawSheets(book);
    }
  }, [book, search, drawSheets, router, id]);

  // české překlady anglických zadání – doplní se samy na pozadí
  useEffect(() => {
    if (!book || busy.translate) return;
    const missing = missingCs(book);
    const sig = missing.map((m) => m.key + m.en.length).join("|");
    if (!missing.length || translateTried.current === sig) return;
    translateTried.current = sig;
    act("translate", { action: "translate" });
  }, [book, busy.translate, act]);

  if (!book) return <main className="wrap"><Header /><p>Načítám…</p></main>;

  const stage = stageOf(book);
  const current = Math.min(view ?? stage, stage);
  const anyBusy = Object.values(busy).some(Boolean) || !!status;
  const drawn = (pred: (p: Page) => boolean) => book.pages.filter((p) => p.image && !isMissing(p.image) && pred(p));

  /** Varování: změna v dřívějším kroku znamená překreslit už nakreslené strany. */
  const guard = (pred: (p: Page) => boolean, what: string) => {
    const k = drawn(pred).length;
    if (!k) return true;
    return confirm(`${what}\n\nIlustrace už jsou nakreslené: ${k} ${plural(k)} bude potřeba překreslit (≈ ${formatCzk(k * imageCzk())}). Pokračovat?`);
  };

  const setCs = (key: string, cs: string, pred: ((p: Page) => boolean) | null, what: string) => {
    if (pred && !guard(pred, what)) return false;
    act(`cs-${key}`, { action: "setCs", key, cs });
    return true;
  };

  /** Přidání postavy / výměna fotek (multipart) – pak se rovnou nakreslí karta. */
  async function sendCharacter(key: string, fd: FormData, cid?: string) {
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      const r = await fetch(`/api/books/${id}/characters`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setBook(j);
      const target = cid ?? (j as Book).characters[(j as Book).characters.length - 1].id;
      await act(`sheet-${target}`, { action: "sheet", cid: target });
      return true;
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : String(e) }));
      return false;
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  async function removeCharacter(cid: string, name: string) {
    const k = drawn((p) => p.characters.includes(cid)).length;
    const inStory = book!.pages.filter((p) => p.characters.includes(cid)).length;
    const msg = `Odebrat postavu ${name}?` +
      (inStory ? `\n\nV příběhu je na ${inStory} ${plural(inStory)}. Z obrázků zmizí, ale v textu zůstane – text uprav nebo napiš příběh znovu.` : "") +
      (k ? `\nNakreslené strany s ní (${k}) bude potřeba překreslit (≈ ${formatCzk(k * imageCzk())}).` : "");
    if (!confirm(msg)) return;
    const r = await fetch(`/api/books/${id}/characters?cid=${cid}`, { method: "DELETE" });
    const j = await r.json();
    if (r.ok) setBook(j);
    else alert(j.error);
  }

  async function finish(step: number) {
    if (step === 1) {
      await act("stage", { action: "stage", stage: 2 });
      setView(2);
      if (!book!.pages.length) await act("story", { action: "story" });
    } else if (step === 2) {
      const long = book!.pages.filter((p) => p.n > 0 && p.text.length > maxChars(book!)).length;
      if (long && !confirm(`Stran s textem delším, než se vejde na stránku: ${long}. Přesto pokračovat?`)) return;
      const r = await act("stage", { action: "stage", stage: 3 });
      setView(3);
      if (r) await drawPlates(r);
    } else if (step === 3) {
      const r = await act("stage", { action: "stage", stage: 4 });
      setView(4);
      if (r) await drawPages(r.pages.filter((p) => isMissing(p.image) || p.stale));
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const missingSheets = book.characters.filter((c) => isMissing(c.sheet)).length;
  const missingPlates = (book.locations ?? []).filter((l) => isMissing(l.plate)).length;
  const spent = costCzk(book.usage);
  const left = remainingCzk(book, isMissing);

  return (
    <main className="wrap" style={{ paddingBottom: 90 }}>
      <Header right={<Link className="btn" href={`/books/${id}/read`}>Číst / tisk PDF</Link>} />
      {status && <div className="progress"><span className="spin" /> {status}</div>}

      <input
        defaultValue={book.title ?? ""}
        key={book.title}
        placeholder="Název pohádky (vznikne s příběhem)"
        onBlur={(e) => e.target.value !== (book.title ?? "") && patch({ page: { n: 0, text: e.target.value }, title: e.target.value })}
        style={{ fontFamily: "Georgia, serif", fontSize: 26, border: "none", background: "transparent", padding: 0 }}
      />

      <nav className="stepper">
        {STEPS.map((s, i) => {
          const n = i + 1;
          return (
            <button key={s} type="button" disabled={n > stage || anyBusy}
              className={`step${n === current ? " active" : ""}${n < stage ? " done" : ""}`}
              onClick={() => setView(n)} title={n > stage ? "Nejdřív dokonči předchozí krok" : ""}>
              <span className="step-n">{n < stage ? "✓" : n}</span> {s}
            </button>
          );
        })}
      </nav>

      {current === 1 && (
        <section>
          <p className="muted">Karty jsou předlohy, podle kterých se kreslí každá strana. Zkontroluj, že postavy sedí (vlasy, oblečení, ruce…). Když ne, uprav popis a nakresli kartu znovu.</p>
          <div className="grid">
            {book.characters.map((c) => {
              const pred = (p: Page) => p.characters.includes(c.id);
              return (
                <div className="card stack" key={c.id}>
                  {c.sheet ? <a href={f(id, c.sheet)} target="_blank" rel="noreferrer"><img className="thumb" src={f(id, c.sheet)} alt={c.name} /></a>
                    : <div className="thumb placeholder">{busy[`sheet-${c.id}`] ? <span className="spin" /> : "zatím bez karty"}</div>}
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{c.isHero && "⭐ "}{c.name}</strong>
                    <span className="pill">{c.role}</span>
                  </div>
                  <div className="photos">{c.photos.map((p) => <img key={p} src={f(id, p)} alt="" />)}</div>
                  <CsField book={book} k={`c:${c.id}:visual`} label="Vzhled" busy={busy[`cs-c:${c.id}:visual`]} error={errors[`cs-c:${c.id}:visual`]}
                    empty="doplní se z fotek" onSave={(v) => setCs(`c:${c.id}:visual`, v, pred, `Změna vzhledu postavy ${c.name}.`)} />
                  <CsField book={book} k={`c:${c.id}:outfit`} label="Oblečení (na všech stranách stejné)" rows={2} busy={busy[`cs-c:${c.id}:outfit`]} error={errors[`cs-c:${c.id}:outfit`]}
                    empty="doplní se podle karty" onSave={(v) => setCs(`c:${c.id}:outfit`, v, pred, `Změna oblečení postavy ${c.name}.`)} />
                  <div className="row">
                    <button className="small" disabled={busy[`sheet-${c.id}`]}
                      onClick={() => guard(pred, `Nová karta postavy ${c.name}.`) && act(`sheet-${c.id}`, { action: "sheet", cid: c.id })}>
                      {busy[`sheet-${c.id}`] ? <><span className="spin" /> Kreslím…</> : c.sheet ? "↻ Překreslit kartu" : "Nakreslit kartu"}
                    </button>
                    <button className="small" disabled={busy[`describe-${c.id}`] || !c.photos.length} title="Znovu popíše vzhled podle fotek"
                      onClick={() => act(`describe-${c.id}`, { action: "describe", cid: c.id })}>
                      Popsat z fotek
                    </button>
                    <label className="btn small file-btn" title="Nahraj jiné fotky – karta se nakreslí znovu">
                      {busy[`photos-${c.id}`] ? <><span className="spin" /> Nahrávám…</> : "Vyměnit fotky"}
                      <input type="file" accept="image/*,.heic,.heif" multiple hidden disabled={busy[`photos-${c.id}`]}
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []).slice(0, 3);
                          e.target.value = "";
                          if (!files.length || !guard(pred, `Nové fotky a karta postavy ${c.name}.`)) return;
                          const fd = new FormData();
                          fd.set("cid", c.id);
                          for (const x of await normalizePhotos(files)) fd.append("photos", x);
                          sendCharacter(`photos-${c.id}`, fd, c.id);
                        }} />
                    </label>
                    {!c.isHero && <button className="small" disabled={anyBusy} onClick={() => removeCharacter(c.id, c.name)}>Odebrat</button>}
                  </div>
                  {(errors[`sheet-${c.id}`] || errors[`describe-${c.id}`] || errors[`photos-${c.id}`]) && <p className="err">{errors[`sheet-${c.id}`] || errors[`describe-${c.id}`] || errors[`photos-${c.id}`]}</p>}
                </div>
              );
            })}
            <AddCharacter busy={!!busy.addChar} error={errors.addChar} hasStory={book.pages.length > 0}
              onAdd={(fd) => sendCharacter("addChar", fd)} />
          </div>
          <StepFooter
            disabled={anyBusy || missingSheets > 0}
            hint={missingSheets ? `Chybí ${missingSheets} ${missingSheets === 1 ? "karta" : "karty"} postav.` : ""}
            label={stage > 1 ? "Pokračovat na příběh →" : "Postavy jsou hotové – napsat příběh →"}
            onClick={() => (stage > 1 ? setView(2) : finish(1))} />
        </section>
      )}

      {current === 2 && (
        <section>
          <div className="card stack" style={{ marginBottom: 12 }}>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              <label>Délka textu na stranu
                <select value={book.textLength ?? "medium"} onChange={(e) => patch({ textLength: e.target.value as TextLength })}>
                  {Object.entries(TEXT_LENGTHS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              <label>Kolik různých míst
                <select value={book.placeCount ?? ""} onChange={(e) => patch({ placeCount: e.target.value })}>
                  {PLACE_COUNTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <label>Počet stran
                <input type="number" min={3} max={20} defaultValue={book.pageCount} key={book.pageCount}
                  onBlur={(e) => Number(e.target.value) !== book.pageCount && patch({ pageCount: Number(e.target.value) })} />
              </label>
            </div>
            <label>O čem má pohádka být
              <textarea defaultValue={book.theme} key={book.theme} onBlur={(e) => e.target.value !== book.theme && patch({ theme: e.target.value })} />
            </label>
            <label>Kde se má pohádka odehrávat (nepovinné)
              <textarea defaultValue={book.places ?? ""} key={`pl-${book.places}`} rows={2}
                placeholder="náš obývák s šedou rohovou sedačkou, lanovka na Ještěd v Liberci"
                onBlur={(e) => e.target.value !== (book.places ?? "") && patch({ places: e.target.value })} />
            </label>
            <p className="muted" style={{ margin: 0 }}>Změny se projeví při dalším „Napsat příběh znovu“ (místa i při „Navrhnout prostředí znovu“).</p>
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button disabled={anyBusy}
              onClick={() => confirm(book.pages.length ? "Napsat celý příběh znovu? Texty, scény i ilustrace se zahodí." : "Napsat příběh?") && act("story", { action: "story" })}>
              {busy.story ? <><span className="spin" /> Píšu…</> : book.pages.length ? "↻ Napsat příběh znovu" : "Napsat příběh"}
            </button>
            {book.pages.length > 0 && (
              <button disabled={anyBusy} title="Změní jen čas vyprávění, ilustrace zůstanou. Jde vrátit."
                onClick={() => confirm("Převést vyprávění všech stran do minulého času? Původní texty si uložím a půjdou vrátit.") && act("pastTense", { action: "pastTense" })}>
                {busy.pastTense ? <><span className="spin" /> Převádím…</> : "Převést do minulého času"}
              </button>
            )}
            {book.textBackup && (
              <button disabled={anyBusy} title={`Vrátí texty ${book.textBackup.label}`}
                onClick={() => confirm(`Vrátit texty stran ${book.textBackup!.label}? Úpravy textů od té doby se ztratí.`) && act("restoreTexts", { action: "restoreTexts" })}>
                ↶ Vrátit texty
              </button>
            )}
            {["story", "pastTense", "restoreTexts"].map((k) => errors[k] && <span key={k} className="err">{errors[k]}</span>)}
          </div>
          {busy.story && !book.pages.length && <p className="muted"><span className="spin" /> Píšu příběh…</p>}
          <div className="stack">
            {book.pages.filter((p) => p.n > 0).map((p) => (
              <StoryPage key={p.n} book={book} page={p} busy={busy} errors={errors} act={act}
                onPatch={(x) => patch({ page: { n: p.n, ...x } })}
                onScene={(v) => setCs(`p:${p.n}:scene`, v, (x) => x.n === p.n, `Změna scény strany ${p.n}.`)} />
            ))}
          </div>
          {book.pages.length > 0 && (
            <StepFooter disabled={anyBusy}
              label={stage > 2 ? "Pokračovat na prostředí →" : "Příběh je hotový – připravit prostředí →"}
              onClick={() => (stage > 2 ? setView(3) : finish(2))} />
          )}
        </section>
      )}

      {current === 3 && (
        <section>
          <p className="muted">
            Pozadí je prázdné místo bez postav. Všechny strany z daného místa se podle něj kreslí, takže ho vylaď tady –
            oprava až v ilustracích je mnohem těžší. Po úpravě popisu pozadí nakresli znovu.
          </p>
          <div className="card stack" style={{ marginBottom: 12 }}>
            <CsField book={book} k="atmosphere" label="Atmosféra celé knížky (roční období, počasí, světlo)" rows={2}
              busy={busy["cs-atmosphere"]} error={errors["cs-atmosphere"]}
              onSave={(v) => setCs("atmosphere", v, (p) => p.n > 0, "Změna atmosféry se týká všech stran.")} />
            <div className="row">
              <button disabled={anyBusy} title="Znovu rozdělí strany do míst a sjednotí scény – texty zůstanou"
                onClick={() => guard((p) => p.n > 0, "Nové rozdělení prostředí.") && act("locations", { action: "locations" })}>
                {busy.locations ? <><span className="spin" /> Sjednocuji…</> : "↻ Navrhnout prostředí znovu"}
              </button>
              {missingPlates > 0 && <button disabled={anyBusy} onClick={() => drawPlates(book)}>Nakreslit chybějící pozadí ({missingPlates})</button>}
              {errors.locations && <span className="err">{errors.locations}</span>}
            </div>
          </div>
          <div className="stack">
            {(book.locations ?? []).map((l) => {
              const pred = (p: Page) => p.n > 0 && p.location === l.id;
              const pages = book.pages.filter(pred).map((p) => p.n);
              const has = l.plate && !isMissing(l.plate);
              return (
                <div key={l.id} className="card page-row narrow">
                  <div className="stack">
                    {busy[`plate-${l.id}`] ? <div className="thumb portrait placeholder"><span className="spin" /></div>
                      : has ? <a href={f(id, l.plate)} target="_blank" rel="noreferrer"><img className="thumb portrait" src={f(id, l.plate)} alt="" /></a>
                        : <div className="thumb portrait placeholder">bez pozadí</div>}
                    <div className="row">
                      <button className="small" disabled={!!busy[`plate-${l.id}`]}
                        onClick={() => (!has || guard(pred, `Nové pozadí „${l.name}“.`)) && act(`plate-${l.id}`, { action: "plate", lid: l.id, force: !!has })}>
                        {has ? "↻ Překreslit pozadí" : "Nakreslit pozadí"}
                      </button>
                    </div>
                    {errors[`plate-${l.id}`] && <p className="err">{errors[`plate-${l.id}`]}</p>}
                  </div>
                  <div className="stack">
                    <strong>{l.name}</strong>
                    <span className="muted">{pages.length ? `Strany: ${pages.join(", ")}` : "Žádná strana se tu neodehrává."}</span>
                    <CsField book={book} k={`l:${l.id}:description`} label="Jak místo vypadá" rows={5}
                      busy={busy[`cs-l:${l.id}:description`]} error={errors[`cs-l:${l.id}:description`]}
                      onSave={(v) => setCs(`l:${l.id}:description`, v, pred, `Změna místa „${l.name}“.`)} />
                  </div>
                </div>
              );
            })}
          </div>
          <StepFooter
            disabled={anyBusy || missingPlates > 0}
            hint={missingPlates ? `Chybí ${missingPlates} pozadí.` : ""}
            label={stage > 3 ? "Pokračovat na ilustrace →" : "Prostředí je hotové – nakreslit ilustrace →"}
            onClick={() => (stage > 3 ? setView(4) : finish(3))} />
        </section>
      )}

      {current === 4 && (
        <Illustrations book={book} busy={busy} errors={errors} act={act} anyBusy={anyBusy} isMissing={isMissing}
          drawPages={drawPages} patch={patch}
          onScene={(n, v) => setCs(`p:${n}:scene`, v, null, "")} />
      )}

      <p style={{ marginTop: 40 }}>
        <button className="small" onClick={async () => { if (confirm("Opravdu smazat celou pohádku včetně fotek?")) { await fetch(`/api/books/${id}`, { method: "DELETE" }); router.push("/"); } }}>
          Smazat pohádku
        </button>
      </p>

      <div className="costbar">
        <span>Gemini zatím: <strong>{formatCzk(spent)}</strong></span>
        {left > 0.05 && <span className="muted">· do hotové knížky ještě ≈ {formatCzk(left)}</span>}
        <span className="muted">· celkem ≈ <strong>{formatCzk(spent + left)}</strong></span>
      </div>
    </main>
  );
}

function AddCharacter({ busy, error, hasStory, onAdd }: {
  busy: boolean; error?: string; hasStory: boolean; onAdd: (fd: FormData) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [converting, setConverting] = useState(false);
  if (!open) {
    return (
      <button type="button" className="card add-card" onClick={() => setOpen(true)}>
        <span style={{ fontSize: 32 }}>＋</span>Přidat postavu
      </button>
    );
  }
  return (
    <form className="card stack" onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData();
      fd.set("name", name);
      fd.set("role", role);
      fd.set("description", description);
      files.forEach((f) => fd.append("photos", f));
      if (await onAdd(fd)) { setOpen(false); setName(""); setRole(""); setDescription(""); setFiles([]); }
    }}>
      <strong>Nová postava</strong>
      <label>Jméno<input value={name} onChange={(e) => setName(e.target.value)} placeholder="babička Iveta / pes Ita" required /></label>
      <label>Kdo to je<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="babička / náš pes, labrador" /></label>
      <label>Povaha a zajímavosti<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></label>
      <label>Fotky (1–3)
        <input type="file" accept="image/*,.heic,.heif" multiple onChange={async (e) => {
          const picked = Array.from(e.target.files ?? []).slice(0, 3);
          setConverting(true);
          try { setFiles(await normalizePhotos(picked)); } finally { setConverting(false); }
        }} />
      </label>
      {files.length > 0 && <div className="photos">{files.map((f, k) => <PhotoThumb key={k} file={f} />)}</div>}
      {hasStory && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Příběh už je napsaný – novou postavu pak v kroku Příběh zaškrtni u stran, kde má být, nebo napiš příběh znovu.</p>}
      {error && <p className="err">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy || converting || !name.trim()}>{busy ? <><span className="spin" /> Přidávám…</> : "Přidat a nakreslit kartu"}</button>
        <button type="button" className="small" onClick={() => setOpen(false)}>Zrušit</button>
      </div>
    </form>
  );
}

function StepFooter({ label, onClick, disabled, hint }: { label: string; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="row step-footer">
      <button className="primary" disabled={disabled} onClick={onClick}>{label}</button>
      {hint && <span className="muted">{hint}</span>}
    </div>
  );
}

/** Česká verze anglického zadání. Úprava se přeloží zpět do angličtiny pro Gemini. */
function CsField({ book, k, label, rows = 3, busy, error, empty, onSave }: {
  book: Book; k: string; label: string; rows?: number; busy?: boolean; error?: string; empty?: string;
  onSave: (v: string) => boolean | void;
}) {
  const cs = csText(book, k);
  const pending = !cs && missingCs(book).some((m) => m.key === k);
  return (
    <label>{label}
      {pending ? <div className="cs-pending"><span className="spin" /> překládám do češtiny…</div> : (
        <textarea key={`${k}-${cs}`} defaultValue={cs ?? ""} rows={rows} placeholder={empty} disabled={busy}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (!v || v === (cs ?? "")) return;
            if (onSave(v) === false) e.target.value = cs ?? "";
          }} />
      )}
      {busy && <span className="muted" style={{ fontSize: 13 }}><span className="spin" /> ukládám…</span>}
      {error && <span className="err">{error}</span>}
    </label>
  );
}

function TextField({ book, page, onPatch, busy, error, act }: {
  book: Book; page: Page; onPatch: (x: Partial<Page>) => void; busy?: boolean; error?: string; act: Act;
}) {
  const max = maxChars(book);
  const [len, setLen] = useState(page.text.length);
  useEffect(() => setLen(page.text.length), [page.text]);
  return (
    <>
      <label>Text
        <textarea key={page.text} defaultValue={page.text} rows={5} onChange={(e) => setLen(e.target.value.length)}
          onBlur={(e) => e.target.value !== page.text && onPatch({ text: e.target.value })} />
      </label>
      <div className="row" style={{ gap: 8, marginTop: -6 }}>
        <span className={len > max ? "err" : "muted"} style={{ fontSize: 13 }}>
          {len} / {max} znaků{len > max ? " – nevejde se na stránku" : ""}
        </span>
        {len > max && (
          <button type="button" className="small" disabled={busy} onClick={() => act(`shorten-${page.n}`, { action: "shorten", n: page.n })}>
            {busy ? <><span className="spin" /> Zkracuji…</> : "Zkrátit"}
          </button>
        )}
        {error && <span className="err">{error}</span>}
      </div>
    </>
  );
}

function StoryPage({ book, page, busy, errors, act, onPatch, onScene }: {
  book: Book; page: Page; busy: Record<string, boolean>; errors: Record<string, string>; act: Act;
  onPatch: (x: Partial<Page>) => void; onScene: (v: string) => boolean | void;
}) {
  return (
    <div className="card stack">
      <strong>Strana {page.n}</strong>
      <TextField book={book} page={page} onPatch={onPatch} act={act} busy={busy[`shorten-${page.n}`]} error={errors[`shorten-${page.n}`]} />
      <CsField book={book} k={`p:${page.n}:scene`} label="Co bude na obrázku" busy={busy[`cs-p:${page.n}:scene`]} error={errors[`cs-p:${page.n}:scene`]} onSave={onScene} />
      <div className="checks">
        {book.characters.map((c) => (
          <label key={c.id}>
            <input type="checkbox" checked={page.characters.includes(c.id)}
              onChange={(e) => onPatch({ characters: e.target.checked ? [...page.characters, c.id] : page.characters.filter((x) => x !== c.id) })} />
            {c.name}
          </label>
        ))}
      </div>
      {(book.locations?.length ?? 0) > 0 && (
        <label>Místo
          <select value={page.location ?? ""} onChange={(e) => onPatch({ location: e.target.value })}>
            <option value="">(neurčeno)</option>
            {book.locations!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function Illustrations({ book, busy, errors, act, anyBusy, isMissing, drawPages, patch, onScene }: {
  book: Book; busy: Record<string, boolean>; errors: Record<string, string>; act: Act; anyBusy: boolean;
  isMissing: (f?: string) => boolean; drawPages: (p: Page[]) => Promise<void>; patch: (b: object) => Promise<void>;
  onScene: (n: number, v: string) => void;
}) {
  const id = book.id;
  const [sel, setSel] = useState<number[]>([]);
  const [comment, setComment] = useState("");
  const [running, setRunning] = useState("");
  const pages = book.pages;
  const stale = pages.filter((p) => p.image && !isMissing(p.image) && p.stale);
  const missing = pages.filter((p) => isMissing(p.image));
  const withIssue = pages.filter((p) => p.issue);
  const selPages = pages.filter((p) => sel.includes(p.n));
  const toggle = (n: number) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));

  async function each(label: string, list: Page[], fn: (p: Page) => Promise<unknown>) {
    let i = 0;
    setRunning(`${label} 0/${list.length}…`);
    await Promise.all([0, 1].map(async () => {
      while (i < list.length) {
        const p = list[i++];
        await fn(p);
        setRunning(`${label} ${Math.min(i, list.length)}/${list.length}…`);
      }
    }));
    setRunning("");
  }

  const checkAll = (list: Page[]) => each("Kontroluji strany", list.filter((p) => p.image && !isMissing(p.image)), (p) => act(`inspect-${p.n}`, { action: "inspect", n: p.n }));
  const fixWith = (list: Page[], text?: string) => {
    if (!confirm(`Opravit ${list.length} ${plural(list.length)} (≈ ${formatCzk(list.length * imageCzk())})? Původní verze obrázků zůstanou k výběru.`)) return;
    return each("Opravuji strany", list, (p) => act(`fix-${p.n}`, { action: "fix", n: p.n, comment: text }));
  };
  const redraw = (list: Page[]) =>
    confirm(`Nakreslit ${list.length} ${plural(list.length)} úplně znovu (≈ ${formatCzk(list.length * imageCzk())})? Staré verze zůstanou k výběru.`) && drawPages(list);

  return (
    <section>
      {running && <div className="progress"><span className="spin" /> {running}</div>}
      {(stale.length > 0 || missing.length > 0) && (
        <div className="card notice row">
          <span>
            {stale.length > 0 && <>⚠️ Zastaralé strany: <strong>{stale.length}</strong> (změnila se karta, pozadí nebo zadání a obrázek už jim neodpovídá). </>}
            {missing.length > 0 && <>Bez ilustrace: <strong>{missing.length}</strong>. </>}
          </span>
          <button className="primary" disabled={anyBusy || !!running} onClick={() => drawPages([...missing, ...stale])}>
            Nakreslit ({stale.length + missing.length}) ≈ {formatCzk((stale.length + missing.length) * imageCzk())}
          </button>
        </div>
      )}

      <div className="card stack fixbar">
        <strong>Kontrola a opravy obrázků</strong>
        <p className="muted" style={{ margin: 0 }}>
          Technické chyby (něco dvakrát, něco navíc, chybí ruka…) najde AI kontrola. Vlastní připomínku napiš níže –
          obrázek se jen upraví, nekreslí se celý znovu. Strany vyber zaškrtnutím u obrázku.
        </p>
        <div className="row">
          <button disabled={anyBusy || !!running} onClick={() => checkAll(pages)}>🔍 Zkontrolovat všechny strany</button>
          {withIssue.length > 0 && (
            <button disabled={anyBusy || !!running} onClick={() => fixWith(withIssue)}>Opravit nalezené chyby ({withIssue.length})</button>
          )}
          <button className="small" onClick={() => setSel(sel.length === pages.length ? [] : pages.map((p) => p.n))}>
            {sel.length === pages.length ? "Zrušit výběr" : "Vybrat všechny"}
          </button>
        </div>
        <label>Připomínka k vybraným stranám ({sel.length ? sel.map((n) => (n === 0 ? "obálka" : n)).join(", ") : "nic nevybráno"})
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="např. pes Jája je na obrázku dvakrát – nech jen jednoho / přidej Elišce do ruky balónek" />
        </label>
        <div className="row">
          <button className="primary" disabled={!sel.length || !comment.trim() || anyBusy || !!running}
            onClick={async () => { await fixWith(selPages, comment); setComment(""); }}>
            Opravit vybrané podle připomínky
          </button>
          <button disabled={!sel.length || anyBusy || !!running} onClick={() => checkAll(selPages)}>🔍 Zkontrolovat vybrané</button>
          <button disabled={!sel.length || anyBusy || !!running} onClick={() => redraw(selPages)}>↻ Nakreslit vybrané znovu</button>
        </div>
      </div>

      <div className="stack">
        {pages.map((p) => (
          <div key={p.n} className={`card page-row${p.n === 0 ? "" : " narrow"}${sel.includes(p.n) ? " selected" : ""}`}>
            <div className="stack">
              {p.image ? <a href={f(id, p.image)} target="_blank" rel="noreferrer"><img className={p.n === 0 ? "thumb wide" : "thumb portrait"} src={f(id, p.image)} alt="" /></a>
                : <div className={`${p.n === 0 ? "thumb wide" : "thumb portrait"} placeholder`}>{busy[`page-${p.n}`] ? <span className="spin" /> : "bez ilustrace"}</div>}
              {(p.imageVersions?.length ?? 0) > 1 && (
                <div className="versions">
                  {p.imageVersions!.map((v) => (
                    <img key={v} src={f(id, v)} alt="" className={v === p.image ? "active" : ""} onClick={() => patch({ page: { n: p.n, image: v } })} title="Použít tuto verzi" />
                  ))}
                </div>
              )}
              <div className="row">
                <label className="checks" style={{ margin: 0 }}><input type="checkbox" checked={sel.includes(p.n)} onChange={() => toggle(p.n)} /> vybrat</label>
                <button className="small" disabled={busy[`page-${p.n}`] || !!running} onClick={() => redraw([p])}>
                  {busy[`page-${p.n}`] ? <><span className="spin" /> Kreslím…</> : p.image ? "↻ Nakreslit znovu" : "Nakreslit"}
                </button>
              </div>
              {errors[`page-${p.n}`] && <p className="err">{errors[`page-${p.n}`]}</p>}
            </div>
            <div className="stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{p.n === 0 ? "Obálka" : `Strana ${p.n}`}</strong>
                {p.stale && <span className="pill warn">zastaralá – překreslit</span>}
              </div>
              {p.n === 0 ? <p style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 20 }}>{book.title}</p>
                : <p className="page-text">{p.text}</p>}
              {busy[`inspect-${p.n}`] && <span className="muted"><span className="spin" /> kontroluji…</span>}
              {p.issue ? (
                <div className="issue">
                  <span>🔍 AI našla: {p.issue}</span>
                  <button className="small" disabled={busy[`fix-${p.n}`] || !!running} onClick={() => fixWith([p])}>
                    {busy[`fix-${p.n}`] ? <><span className="spin" /> Opravuji…</> : "Opravit"}
                  </button>
                </div>
              ) : p.checkedAt ? <span className="muted" style={{ fontSize: 13 }}>✓ AI kontrola bez chyb</span> : null}
              {busy[`fix-${p.n}`] && !p.issue && <span className="muted"><span className="spin" /> opravuji…</span>}
              {(errors[`fix-${p.n}`] || errors[`inspect-${p.n}`]) && <span className="err">{errors[`fix-${p.n}`] || errors[`inspect-${p.n}`]}</span>}
              <CsField book={book} k={`p:${p.n}:scene`} label="Co je na obrázku (zadání)" busy={busy[`cs-p:${p.n}:scene`]} error={errors[`cs-p:${p.n}:scene`]}
                onSave={(v) => onScene(p.n, v)} />
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Po změně zadání dostane strana štítek „zastaralá“ – pak ji nakresli znovu.</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
