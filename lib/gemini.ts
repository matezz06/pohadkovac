import sharp from "sharp";
import { loadSettings } from "./store";

const API_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";

// "npm run mock" zapne testovací režim i na Windows (bez nastavování proměnných)
export const isMock = () => process.env.GEMINI_MOCK === "1" || process.env.npm_lifecycle_event === "mock";

export type Usage = { model: string; inputTokens: number; outputTokens: number; images: number };

export type InputPart = { text: string } | { image: Buffer; mime: string };

export async function models() {
  const s = await loadSettings();
  return {
    text: s.textModel || process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash",
    image: s.imageModel || process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
  };
}

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("Chybí GEMINI_API_KEY v souboru .env.local");
  return k;
}

function toApiParts(parts: InputPart[]) {
  return parts.map((p) =>
    "text" in p ? { text: p.text } : { inlineData: { mimeType: p.mime, data: p.image.toString("base64") } },
  );
}

async function call(model: string, body: unknown, attempt = 0): Promise<any> {
  const res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    // Free tier bez nároku na tento model (limit 0) – čekání nepomůže.
    if (res.status === 429 && /limit: 0\b/.test(txt)) {
      throw new Error(
        `Model ${model} není v bezplatném režimu dostupný. Zapni placení (billing) v Google AI Studio → Billing, pak to zkus znovu.`,
      );
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      // Google posílá, za kolik sekund to zkusit znovu ("retry in 15.8s")
      const m = txt.match(/retry in ([\d.]+)s/i) ?? txt.match(/"retryDelay":\s*"(\d+)s"/);
      const wait = m ? Math.min(60, Number(m[1]) + 1) * 1000 : 2000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
      return call(model, body, attempt + 1);
    }
    if (res.status === 429) {
      throw new Error(`Překročen limit požadavků u modelu ${model}. Počkej minutu a zkus to znovu (nebo zapni billing pro vyšší limity).`);
    }
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 500)}`);
  }
  return res.json();
}

function usageOf(model: string, json: any, images = 0): Usage {
  const u = json?.usageMetadata ?? {};
  return {
    model,
    inputTokens: u.promptTokenCount ?? 0,
    outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    images,
  };
}

function parts(json: any): any[] {
  return json?.candidates?.[0]?.content?.parts ?? [];
}

/** Text generation. If `schema` is given, the model must return JSON matching it. */
export async function generateText(
  input: InputPart[],
  opts: { schema?: object; system?: string; temperature?: number } = {},
): Promise<{ text: string; usage: Usage }> {
  const { text: model } = await models();
  if (isMock()) return { text: "", usage: { model: "mock", inputTokens: 0, outputTokens: 0, images: 0 } };
  const body: any = {
    contents: [{ role: "user", parts: toApiParts(input) }],
    generationConfig: { temperature: opts.temperature ?? 0.9 },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  if (opts.schema) {
    body.generationConfig.responseMimeType = "application/json";
    body.generationConfig.responseSchema = opts.schema;
  }
  const json = await call(model, body);
  const text = parts(json)
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
  if (!text) throw new Error("Model nevrátil text: " + JSON.stringify(json).slice(0, 400));
  return { text, usage: usageOf(model, json) };
}

/** Image generation with optional reference images. Returns PNG/JPEG buffer. */
export async function generateImage(
  input: InputPart[],
  opts: { aspectRatio?: string; mockLabel?: string } = {},
): Promise<{ image: Buffer; mime: string; usage: Usage }> {
  const { image: model } = await models();
  if (isMock()) {
    return {
      image: await mockImage(opts.mockLabel ?? "obrázek", opts.aspectRatio),
      mime: "image/png",
      usage: { model: "mock", inputTokens: 0, outputTokens: 0, images: 1 },
    };
  }
  const body = {
    contents: [{ role: "user", parts: toApiParts(input) }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: opts.aspectRatio ?? "4:3" },
    },
  };
  const json = await call(model, body);
  const img = parts(json).find((p) => p.inlineData?.data || p.inline_data?.data);
  if (!img) {
    const reason = json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason;
    const txt = parts(json).map((p) => p.text).filter(Boolean).join(" ");
    throw new Error(`Model nevrátil obrázek (${reason ?? "?"}). ${txt}`.slice(0, 500));
  }
  const d = img.inlineData ?? img.inline_data;
  return {
    image: Buffer.from(d.data, "base64"),
    mime: d.mimeType ?? d.mime_type ?? "image/png",
    usage: usageOf(model, json, 1),
  };
}

export async function listAvailableModels(): Promise<string[]> {
  if (isMock()) return ["mock-text", "mock-image"];
  const out: string[] = [];
  let pageToken = "";
  do {
    const res = await fetch(`${API_BASE}/models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`, {
      headers: { "x-goog-api-key": key() },
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    for (const m of json.models ?? []) {
      if ((m.supportedGenerationMethods ?? []).includes("generateContent")) out.push(String(m.name).replace(/^models\//, ""));
    }
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return out.sort();
}

async function mockImage(label: string, aspect = "4:3") {
  const [aw, ah] = aspect.split(":").map(Number);
  const w = 1024;
  const h = Math.round((w * ah) / aw);
  const hue = Math.floor(Math.random() * 360);
  const esc = label.replace(/[<>&]/g, "").slice(0, 60);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},70%,85%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,70%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${w * 0.8}" cy="${h * 0.22}" r="${h * 0.1}" fill="#fff8" />
    <text x="50%" y="50%" font-family="sans-serif" font-size="42" text-anchor="middle" fill="#333">MOCK: ${esc}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
