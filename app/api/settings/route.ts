import { NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/store";
import { isMock, models } from "@/lib/gemini";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ...(await models()), mock: isMock(), hasKey: !!process.env.GEMINI_API_KEY });
}

export async function POST(req: Request) {
  const { text, image } = await req.json();
  const s = await loadSettings();
  if (text !== undefined) s.textModel = text || undefined;
  if (image !== undefined) s.imageModel = image || undefined;
  await saveSettings(s);
  return NextResponse.json(await models());
}
