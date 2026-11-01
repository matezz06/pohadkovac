import { getStylePreview } from "@/lib/stylePreview";

export const runtime = "nodejs";
export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const img = await getStylePreview(id);
    return new Response(new Uint8Array(img), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Chyba", { status: 500 });
  }
}
