import { NextResponse } from "next/server";
import { listAvailableModels } from "@/lib/gemini";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await listAvailableModels());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
