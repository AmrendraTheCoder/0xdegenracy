import { getStore } from "@/lib/server/store";
import { buildGameFrameHtml, CUSTOM_GAME_CSP } from "@/lib/customGameHtml";

export const runtime = "nodejs";

// GET /api/custom-game/:id -> the sandboxed HTML document for an AI-written game.
// Embedded by the game page as <iframe sandbox="allow-scripts"> (no allow-same-origin), served with a
// no-network CSP. It must only ever be framed by our own pages.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{6,16}$/.test(id)) return new Response("Not found", { status: 404 });
  const game = await getStore().get(id);
  if (!game || game.config.gameType !== "custom" || !game.config.code) return new Response("Not found", { status: 404 });

  const html = buildGameFrameHtml({ code: game.config.code, cfg: game.config, imageUrl: game.image_url });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `${CUSTOM_GAME_CSP}; frame-ancestors 'self'`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=(), clipboard-write=()",
      "Cache-Control": game.status === "live" ? "public, max-age=60, s-maxage=600" : "no-store",
    },
  });
}
