"use client";
import { useState } from "react";
import { STYLES } from "@/lib/styles";

/** Výběr stylu ilustrací s náhledem – ukázky se při prvním otevření jednou vygenerují a pak se jen načítají. */
export default function StylePicker({ value, onChange, allowCustom = false }: {
  value: string;
  onChange: (id: string) => void;
  allowCustom?: boolean;
}) {
  const [failed, setFailed] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="muted">Styl ilustrací – klikni na ten, který se ti líbí</span>
      <div className="style-grid">
        {STYLES.map((s) => (
          <button type="button" key={s.id} className={`style-card${value === s.id ? " active" : ""}`} onClick={() => onChange(s.id)}>
            <div className="style-img">
              {!loaded[s.id] && !failed[s.id] && <span className="placeholder"><span className="spin" /> kreslím ukázku…</span>}
              {failed[s.id] ? (
                <span className="placeholder" onClick={(e) => { e.stopPropagation(); setFailed({ ...failed, [s.id]: 0 }); }}>ukázka se nenačetla – klikni pro nový pokus</span>
              ) : (
                <img
                  key={`${s.id}-${failed[s.id] ?? 0}`}
                  src={`/api/style-preview/${s.id}`}
                  alt={s.label}
                  style={{ opacity: loaded[s.id] ? 1 : 0 }}
                  ref={(el) => { if (el?.complete && el.naturalWidth && !loaded[s.id]) setLoaded((l) => ({ ...l, [s.id]: true })); }}
                  onLoad={() => setLoaded((l) => ({ ...l, [s.id]: true }))}
                  onError={() => setFailed((f) => ({ ...f, [s.id]: (f[s.id] ?? 0) + 1 }))}
                />
              )}
            </div>
            <span className="style-label">{value === s.id ? "✓ " : ""}{s.label}</span>
          </button>
        ))}
        {allowCustom && (
          <button type="button" className={`style-card${value === "custom" ? " active" : ""}`} onClick={() => onChange("custom")}>
            <div className="style-img"><span className="placeholder">✏️ vlastní popis stylu</span></div>
            <span className="style-label">{value === "custom" ? "✓ " : ""}Vlastní…</span>
          </button>
        )}
      </div>
    </div>
  );
}
