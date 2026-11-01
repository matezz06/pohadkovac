"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import StylePicker from "@/components/StylePicker";
import PhotoThumb from "@/components/PhotoThumb";
import { normalizePhotos } from "@/lib/photoFiles";
import { STYLES } from "@/lib/styles";
import { PLACE_COUNTS, TEXT_LENGTHS } from "@/lib/prompts";
import type { TextLength } from "@/lib/types";
import { estimateCzk, formatCzk } from "@/lib/pricing";

type C = { name: string; role: string; description: string; isHero: boolean; files: File[] };

const empty = (isHero = false): C => ({
  name: "",
  role: isHero ? "hlavní hrdinka, holčička" : "",
  description: "",
  isHero,
  files: [],
});

export default function NewBook() {
  const router = useRouter();
  const [chars, setChars] = useState<C[]>([empty(true), empty()]);
  const [age, setAge] = useState(3);
  const [styleId, setStyleId] = useState(STYLES[0].id);
  const [customStyle, setCustomStyle] = useState("");
  const [theme, setTheme] = useState("");
  const [lesson, setLesson] = useState("");
  const [places, setPlaces] = useState("");
  const [placeCount, setPlaceCount] = useState("");
  const [placeTouched, setPlaceTouched] = useState(false);
  // počet míst se předvyplní podle toho, kolik jich rodič vypsal (dokud ho nezmění ručně)
  const onPlaces = (v: string) => {
    setPlaces(v);
    if (placeTouched) return;
    const n = v.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).length;
    setPlaceCount(n === 0 ? "" : n === 1 ? "1" : n <= 3 ? "2-3" : "4-5");
  };
  const [pageCount, setPageCount] = useState(10);
  const [textLength, setTextLength] = useState<TextLength>("medium");
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(0);
  const [err, setErr] = useState("");

  const upd = (i: number, patch: Partial<C>) => setChars((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const valid = chars.filter((c) => c.name.trim());
    if (!valid.length) return setErr("Vyplň aspoň hlavního hrdinu.");
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.set("childAge", String(age));
    fd.set("styleId", styleId);
    fd.set("customStyle", customStyle);
    fd.set("theme", theme);
    fd.set("lesson", lesson);
    fd.set("places", places);
    fd.set("placeCount", placeCount);
    fd.set("pageCount", String(pageCount));
    fd.set("textLength", textLength);
    fd.set("characters", JSON.stringify(valid.map(({ files, ...c }) => c)));
    valid.forEach((c, i) => c.files.forEach((f) => fd.append(`photo_${i}`, f)));
    const res = await fetch("/api/books", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setErr(json.error ?? "Chyba");
    }
    router.push(`/books/${json.id}?auto=1`);
  }

  return (
    <main className="wrap">
      <Header />
      <form onSubmit={submit} className="stack">
        <h2 style={{ marginTop: 0 }}>Postavy</h2>
        <p className="muted">
          Ke každé postavě nahraj 1–3 jasné fotky (obličej zepředu, dobré světlo, jen ta jedna osoba/zvíře).
          Popis pomůže s povahou v příběhu.
        </p>
        <div className="grid">
          {chars.map((c, i) => (
            <div className="card stack" key={i}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{c.isHero ? "⭐ Hlavní hrdina" : `Postava ${i}`}</strong>
                {!c.isHero && (
                  <button type="button" className="small" onClick={() => setChars((cs) => cs.filter((_, j) => j !== i))}>
                    odebrat
                  </button>
                )}
              </div>
              <label>Jméno<input value={c.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder={c.isHero ? "Anička" : "strejda Honza / Bety"} /></label>
              <label>Kdo to je<input value={c.role} onChange={(e) => upd(i, { role: e.target.value })} placeholder="strejda / náš pes, border kolie / babička" /></label>
              <label>Povaha a zajímavosti
                <textarea value={c.description} onChange={(e) => upd(i, { description: e.target.value })} placeholder="pořád vtipkuje, hraje na kytaru / všechno sní, bojí se vysavače" />
              </label>
              <label>Fotky
                <input type="file" accept="image/*,.heic,.heif" multiple onChange={async (e) => {
                  const picked = Array.from(e.target.files ?? []).slice(0, 3);
                  setConverting((n) => n + 1);
                  try { upd(i, { files: await normalizePhotos(picked) }); } finally { setConverting((n) => n - 1); }
                }} />
              </label>
              {c.files.length > 0 && (
                <div className="photos">
                  {c.files.map((f, k) => <PhotoThumb key={k} file={f} />)}
                </div>
              )}
            </div>
          ))}
        </div>
        <div>
          <button type="button" onClick={() => setChars((cs) => [...cs, empty()])}>+ Přidat postavu</button>
        </div>

        <h2>Pohádka</h2>
        <div className="card stack">
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            <label>Věk dítěte<input type="number" min={1} max={10} value={age} onChange={(e) => setAge(Number(e.target.value))} /></label>
            <label>Počet stran<input type="number" min={3} max={20} value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))} /></label>
            <label>Délka textu na stranu
              <select value={textLength} onChange={(e) => setTextLength(e.target.value as TextLength)}>
                {Object.entries(TEXT_LENGTHS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          </div>
          <StylePicker value={styleId} onChange={setStyleId} allowCustom />
          {styleId === "custom" && (
            <label>Vlastní styl (ideálně anglicky)<input value={customStyle} onChange={(e) => setCustomStyle(e.target.value)} placeholder="gouache illustration, autumn colours, cozy" /></label>
          )}
          <label>O čem má pohádka být (nepovinné)
            <textarea value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Výlet k rybníku, kde pes Bety ztratí míček a Anička ho najde…" />
          </label>
          <label>Kde se má pohádka odehrávat (nepovinné)
            <textarea value={places} onChange={(e) => onPlaces(e.target.value)} rows={2}
              placeholder="náš obývák s šedou rohovou sedačkou a růžovou podložkou na cvičení, lanovka na Ještěd v Liberci" />
            <span className="muted" style={{ fontSize: 13 }}>Čím konkrétnější popis (barvy, nábytek, výrazné věci), tím víc se prostředí na obrázcích přiblíží skutečnosti.</span>
          </label>
          <label>Kolik různých míst (prostředí)
            <select value={placeCount} onChange={(e) => { setPlaceCount(e.target.value); setPlaceTouched(true); }}>
              {PLACE_COUNTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 13 }}>Méně míst = jednotnější obrázky a méně ladění. U dlouhých pohádek o výletu se hodí víc.</span>
            {(() => {
              const listed = places.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).length;
              const max = placeCount === "1" ? 1 : placeCount === "4-5" ? 5 : 3;
              return listed > max ? <span className="err" style={{ fontSize: 13 }}>Vypsal(a) jsi {listed} míst, ale zvolený počet je nejvýš {max} – některá místa se do pohádky nedostanou.</span> : null;
            })()}
          </label>
          <label>Co si má dítě odnést (nepovinné)
            <input value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="že se nemusí bát tmy / že se o hračky dělíme" />
          </label>
        </div>

        {converting > 0 && <p className="muted"><span className="spin" /> Připravuji fotky z iPhonu…</p>}
        {err && <p className="err">{err}</p>}
        <div>
          <button className="primary" disabled={busy || converting > 0}>{busy ? <><span className="spin" /> Nahrávám…</> : "Vytvořit a začít generovat →"}</button>
        </div>
        <div className="estimate">
          Odhad nákladů na Gemini: <strong>≈ {formatCzk(estimateCzk(Math.max(1, chars.filter((c) => c.name.trim()).length), pageCount, placeCount))}</strong>
          <span className="muted"> · postavy: {Math.max(1, chars.filter((c) => c.name.trim()).length)}, stran: {pageCount} + obálka, míst: {placeCount === "1" ? 1 : placeCount === "4-5" ? "4–5" : "2–3"}</span>
        </div>
      </form>
    </main>
  );
}
