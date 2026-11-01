"use client";
import { useEffect, useState } from "react";

/** Náhled vybrané fotky. HEIC z iPhonu prohlížeč (mimo Safari) neukáže – místo prázdného rámečku dáme štítek. */
export default function PhotoThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    setBroken(false);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const heic = /\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type);
  if (broken || !url) {
    return (
      <div className="photo-ph" title={file.name}>
        {heic ? "HEIC ✓" : "foto ✓"}
        <small>{heic ? "náhled nejde, nahraje se" : file.name}</small>
      </div>
    );
  }
  return <img src={url} alt="" onError={() => setBroken(true)} />;
}
