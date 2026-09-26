"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { STYLES } from "@/lib/styles";
import { PACKAGES } from "@/lib/packages";

type C = { name: string; role: string; description: string; files: File[] };
const empty = (hero = false): C => ({ name: "", role: hero ? "hlavní hrdina/hrdinka" : "", description: "", files: [] });

/** Zákaznická objednávka – zjednodušený formulář s balíčky a pevnými limity. */
export default function Order() {
  const router = useRouter();
  const [pkgId, setPkgId] = useState(PACKAGES[1].id);
  const pkg = PACKAGES.find((p) => p.id === pkgId)!;
  const [chars, setChars] = useState<C[]>([empty(true)]);
  const [age, setAge] = useState(3);
  const [styleId, setStyleId] = useState(STYLES[0].id);
  const [theme, setTheme] = useState("");
  const [lesson, setLesson] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const upd = (i: number, patch: Partial<C>) => setChars((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const visible = chars.slice(0, pkg.maxCharacters);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const valid = visible.filter((c) => c.name.trim());
    if (!valid.length || !chars[0].name.trim()) return setErr("Vyplň jméno hlavního hrdiny.");
    const noPhoto = valid.find((c) => !c.files.length);
    if (noPhoto) return setErr(`Přidej fotku k postavě „${noPhoto.name}“.`);
    if (!consent) return setErr("Potvrď prosím souhlas se zpracováním fotek.");
    setBusy(true);
    const fd = new FormData();
    fd.set("packageId", pkgId);
    fd.set("childAge", String(age));
    fd.set("styleId", styleId);
    fd.set("theme", theme);
    fd.set("lesson", lesson);
    fd.set("consent", "1");
    fd.set("characters", JSON.stringify(valid.map(({ files, ...c }, i) => ({ ...c, isHero: i === 0 }))));
    valid.forEach((c, i) => c.files.forEach((f) => fd.append(`photo_${i}`, f)));
    const res = await fetch("/api/customer/books", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setErr(json.error ?? "Chyba");
    }
    router.push(`/b/${json.id}`);
  }

  return (
    <main className="wrap">
      <header className="top"><h1>📖 Pohádka pro vaše dítě</h1></header>
      <form onSubmit={submit} className="stack">
        <h2 style={{ marginTop: 0 }}>1. Vyberte balíček</h2>
        <div className="grid">
          {PACKAGES.map((p) => (
            <label key={p.id} className={`card pkg${p.id === pkgId ? " active" : ""}`}>
              <input type="radio" name="pkg" checked={p.id === pkgId} onChange={() => setPkgId(p.id)} />
              <strong style={{ color: "var(--ink)", fontSize: 17 }}>{p.label}</strong>
              <span>až {p.maxCharacters} postavy · 1 kolo úprav</span>
              <span className="price">{p.priceCzk} Kč</span>
            </label>
          ))}
        </div>

        <h2>2. Postavy</h2>
        <p className="muted">První postava je hlavní hrdina. Ke každé nahrajte 1–3 jasné fotky (obličej, dobré světlo, jen ta osoba/zvíře).</p>
        <div className="grid">
          {visible.map((c, i) => (
            <div className="card stack" key={i}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{i === 0 ? "⭐ Hlavní hrdina" : `Postava ${i + 1}`}</strong>
                {i > 0 && <button type="button" className="small" onClick={() => setChars((cs) => cs.filter((_, j) => j !== i))}>odebrat</button>}
              </div>
              <label>Jméno<input value={c.name} onChange={(e) => upd(i, { name: e.target.value })} /></label>
              <label>Kdo to je<input value={c.role} onChange={(e) => upd(i, { role: e.target.value })} placeholder="strejda / náš pes, labrador" /></label>
              <label>Povaha a zajímavosti<textarea value={c.description} onChange={(e) => upd(i, { description: e.target.value })} /></label>
              <label>Fotky
                <input type="file" accept="image/*" multiple onChange={(e) => upd(i, { files: Array.from(e.target.files ?? []).slice(0, 3) })} />
              </label>
              {c.files.length > 0 && <div className="photos">{c.files.map((f, k) => <img key={k} src={URL.createObjectURL(f)} alt="" />)}</div>}
            </div>
          ))}
        </div>
        {visible.length < pkg.maxCharacters && (
          <div><button type="button" onClick={() => setChars((cs) => [...cs.slice(0, pkg.maxCharacters), empty()])}>+ Přidat postavu</button></div>
        )}

        <h2>3. Pohádka</h2>
        <div className="card stack">
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            <label>Věk dítěte<input type="number" min={1} max={10} value={age} onChange={(e) => setAge(Number(e.target.value))} /></label>
            <label>Styl ilustrací
              <select value={styleId} onChange={(e) => setStyleId(e.target.value)}>
                {STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <label>O čem má pohádka být (nepovinné)<textarea value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={1000} /></label>
          <label>Co si má dítě odnést (nepovinné)<input value={lesson} onChange={(e) => setLesson(e.target.value)} maxLength={300} /></label>
        </div>

        <label className="checks" style={{ color: "var(--ink)" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Souhlasím se zpracováním nahraných fotek pro vytvoření pohádky. Mám svolení osob na fotkách (u dětí jsem zákonný zástupce).
        </label>

        {err && <p className="err">{err}</p>}
        <div><button className="primary" disabled={busy}>{busy ? <><span className="spin" /> Nahrávám…</> : `Vytvořit pohádku (${pkg.priceCzk} Kč) →`}</button></div>
        <p className="muted">Platba zatím není napojená – jde o testovací verzi.</p>
      </form>
    </main>
  );
}
