"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { STYLES } from "@/lib/styles";

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
  const [pageCount, setPageCount] = useState(10);
  const [busy, setBusy] = useState(false);
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
    fd.set("pageCount", String(pageCount));
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
                <input type="file" accept="image/*" multiple onChange={(e) => upd(i, { files: Array.from(e.target.files ?? []).slice(0, 3) })} />
              </label>
              {c.files.length > 0 && (
                <div className="photos">
                  {c.files.map((f, k) => <img key={k} src={URL.createObjectURL(f)} alt="" />)}
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
            <label>Styl ilustrací
              <select value={styleId} onChange={(e) => setStyleId(e.target.value)}>
                {STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                <option value="custom">Vlastní…</option>
              </select>
            </label>
          </div>
          {styleId === "custom" && (
            <label>Vlastní styl (ideálně anglicky)<input value={customStyle} onChange={(e) => setCustomStyle(e.target.value)} placeholder="gouache illustration, autumn colours, cozy" /></label>
          )}
          <label>O čem má pohádka být (nepovinné)
            <textarea value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Výlet k rybníku, kde pes Bety ztratí míček a Anička ho najde…" />
          </label>
          <label>Co si má dítě odnést (nepovinné)
            <input value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="že se nemusí bát tmy / že se o hračky dělíme" />
          </label>
        </div>

        {err && <p className="err">{err}</p>}
        <div>
          <button className="primary" disabled={busy}>{busy ? <><span className="spin" /> Nahrávám…</> : "Vytvořit a začít generovat →"}</button>
        </div>
      </form>
    </main>
  );
}
