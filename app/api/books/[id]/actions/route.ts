import { NextResponse } from "next/server";
import { updateBook } from "@/lib/store";
import { assignLocations, describeCharacter, generatePageImage, generateSheet, generateStory, convertToPastTense, restoreTexts, drawLocationPlate, shortenPageText, translateMissing, setCzech, inspectPage, fixPage } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { action, cid, n, lid, force, key, cs, comment, stage } = await req.json();
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
      case "translate":
        return NextResponse.json(await translateMissing(id));
      case "setCs":
        return NextResponse.json(await setCzech(id, String(key), String(cs ?? "")));
      case "inspect":
        return NextResponse.json(await inspectPage(id, Number(n)));
      case "fix":
        return NextResponse.json(await fixPage(id, Number(n), comment));
      case "stage":
        return NextResponse.json(await updateBook(id, (b) => { b.stage = Math.max(b.stage ?? 1, Math.min(4, Number(stage))); }));
      case "shorten":
        return NextResponse.json(await shortenPageText(id, Number(n)));
      case "plate":
        return NextResponse.json(await drawLocationPlate(id, String(lid), !!force));
      case "pastTense":
        return NextResponse.json(await convertToPastTense(id));
      case "restoreTexts":
        return NextResponse.json(await restoreTexts(id));
      default:
        return NextResponse.json({ error: "Neznámá akce" }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
