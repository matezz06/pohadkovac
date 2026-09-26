import { readBookFile } from "@/lib/store";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; name: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id, name } = await params;
  try {
    const buf = await readBookFile(id, name);
    const type = name.endsWith(".png") ? "image/png" : "image/jpeg";
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Nenalezeno", { status: 404 });
  }
}
