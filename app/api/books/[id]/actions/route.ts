import { NextResponse } from "next/server";
import { assignLocations, describeCharacter, generatePageImage, generateSheet, generateStory } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { action, cid, n } = await req.json();
  try {
    switch (action) {
      case "describe":
        return NextResponse.json(await describeCharacter(id, cid));
      case "sheet":
        return NextResponse.json(await generateSheet(id, cid));
      case "story":
        return NextResponse.json(await generateStory(id));
      case "locations":
        return NextResponse.json(await assignLocations(id));
      case "page":
        return NextResponse.json(await generatePageImage(id, Number(n)));
      default:
        return NextResponse.json({ error: "Neznámá akce" }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
