"use client";
import { useEffect, useState } from "react";
import Header from "@/components/Header";

type S = { text: string; image: string; mock: boolean; hasKey: boolean };

export default function Settings() {
  const [s, setS] = useState<S | null>(null);
  const [list, setList] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setS);
    fetch("/api/models").then(async (r) => {
      const j = await r.json();
      if (r.ok) setList(j); else setErr(j.error);
    });
  }, []);

  if (!s) return <main className="wrap"><Header /><p>Načítám…</p></main>;

  const save = async () => {
    const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: s.text, image: s.image }) });
    setS({ ...s, ...(await r.json()) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const imageModels = list.filter((m) => m.includes("image"));
  const textModels = list.filter((m) => !m.includes("image") && !m.includes("embedding") && !m.includes("tts"));

  return (
    <main className="wrap">
      <Header />
      <div className="card stack" style={{ maxWidth: 560 }}>
        <p>
          API klíč: {s.hasKey ? "✅ nastaven" : "❌ chybí – doplň GEMINI_API_KEY do .env.local a restartuj"}
          {s.mock && <><br /><strong>Běží testovací režim (GEMINI_MOCK=1) – nic se neplatí, obrázky jsou zástupné.</strong></>}
        </p>
        <label>Model pro text a popisy postav
          <input list="text-models" value={s.text} onChange={(e) => setS({ ...s, text: e.target.value })} />
          <datalist id="text-models">{textModels.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        <label>Model pro obrázky
          <input list="image-models" value={s.image} onChange={(e) => setS({ ...s, image: e.target.value })} />
          <datalist id="image-models">{imageModels.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        {imageModels.length > 0 && <p className="muted">Dostupné obrázkové modely: {imageModels.join(", ")}</p>}
        {err && <p className="err">Seznam modelů se nepodařilo načíst: {err}</p>}
        <div className="row"><button className="primary" onClick={save}>Uložit</button>{saved && <span className="muted">Uloženo</span>}</div>
      </div>
    </main>
  );
}
