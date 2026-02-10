import { NextResponse } from "next/server";

import { renderBoardSvg } from "@/lib/chess-utils";
import { ensureDbReady, db } from "@/lib/db";
import { getSnapshotPath, getSnapshotVersion } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    gameId: string;
    version: string;
  };
};

export async function GET(req: Request, ctx: RouteContext) {
  await ensureDbReady();

  const requestUrl = new URL(req.url);
  const requestedSize = Number.parseInt(requestUrl.searchParams.get("size") ?? "560", 10);
  const size = Number.isFinite(requestedSize)
    ? Math.min(1200, Math.max(200, requestedSize))
    : 560;

  const gameId = ctx.params.gameId;
  const requested = ctx.params.version;
  const requestedVersion = requested.endsWith(".svg") ? requested.slice(0, -4) : requested;

  const game = await db.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      fen: true,
      isPublic: true,
      updatedAt: true
    }
  });

  if (!game || !game.isPublic) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  const currentVersion = getSnapshotVersion(game.updatedAt);
  if (requestedVersion !== currentVersion) {
    const redirectUrl = new URL(getSnapshotPath(game.id, currentVersion, size), req.url);
    return NextResponse.redirect(redirectUrl, {
      status: 302,
      headers: {
        "cache-control": "no-store"
      }
    });
  }

  const svg = renderBoardSvg(game.fen, size);
  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": `inline; filename="${game.id}-${currentVersion}.svg"`
    }
  });
}
