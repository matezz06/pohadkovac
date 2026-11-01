"use client";

/** Je soubor HEIC/HEIF (fotky z iPhonu)? */
export function looksHeic(f: File) {
  return /\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/i.test(f.type);
}

/**
 * Fotky z iPhonu (HEIC) převede přímo v prohlížeči na JPG – pak jde ukázat náhled
 * a server dostane běžný formát. Převodník se načte jen když je potřeba (je velký).
 */
export async function normalizePhotos(files: File[]): Promise<File[]> {
  if (!files.some(looksHeic)) return files;
  const { heicTo } = await import("heic-to/next");
  return Promise.all(
    files.map(async (f) => {
      if (!looksHeic(f)) return f;
      try {
        const blob = await heicTo({ blob: f, type: "image/jpeg", quality: 0.9 });
        return new File([blob], f.name.replace(/\.(heic|heif)$/i, "") + ".jpg", { type: "image/jpeg" });
      } catch {
        return f; // nepovedlo se – pošle se originál, server ho převede sám
      }
    }),
  );
}
