import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCAL_IMAGE_DIR } from "@/lib/server/store";

export const runtime = "nodejs";

// Dev-only: serves images saved by the LocalStore. In production images come from Supabase Storage.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const m = /^([a-z0-9]{6,16})\.(png|jpg|webp)$/.exec(name);
  if (!m) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(join(LOCAL_IMAGE_DIR, name));
    const type = m[2] === "png" ? "image/png" : m[2] === "jpg" ? "image/jpeg" : "image/webp";
    return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
