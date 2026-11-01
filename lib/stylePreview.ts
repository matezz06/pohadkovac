/**
 * Ukázky stylů ilustrací: každý styl se vygeneruje JEDNOU (cca 1–2 Kč) a uloží do DATA_DIR/style-previews.
 * Při změně popisu stylu v lib/styles.ts stačí soubor smazat a vznikne nový.
 */
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { DATA_DIR } from "./store";
import { STYLES } from "./styles";
import { generateImage, isMock } from "./gemini";
import { stylePreviewPrompt } from "./prompts";

const DIR = path.join(DATA_DIR, "style-previews");
const inflight = new Map<string, Promise<Buffer>>();

function fileFor(styleId: string, prompt: string) {
  // hash popisu stylu v názvu souboru → po úpravě popisu se ukázka sama přegeneruje
  const h = crypto.createHash("sha1").update(prompt).digest("hex").slice(0, 8);
  return path.join(DIR, `${isMock() ? "mock-" : ""}${styleId}-${h}.jpg`);
}

export async function getStylePreview(styleId: string): Promise<Buffer> {
  const style = STYLES.find((s) => s.id === styleId);
  if (!style) throw new Error("Neznámý styl");
  const file = fileFor(style.id, style.prompt);
  try {
    return await fs.readFile(file);
  } catch {}
  if (!inflight.has(file)) {
    inflight.set(
      file,
      (async () => {
        const r = await generateImage([{ text: stylePreviewPrompt(style.prompt) }], {
          aspectRatio: "4:3",
          mockLabel: style.label,
        });
        const out = await sharp(r.image).resize(640, 480, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
        await fs.mkdir(DIR, { recursive: true });
        await fs.writeFile(file, out);
        return out;
      })().finally(() => inflight.delete(file)),
    );
  }
  return inflight.get(file)!;
}
