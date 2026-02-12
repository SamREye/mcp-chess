import { NextResponse } from "next/server";
import sharp from "sharp";

import { renderBoardSvg } from "@/lib/chess-utils";
import { ensureDbReady, db } from "@/lib/db";
import {
  getSnapshotMimeType,
  getSnapshotPath,
  getSnapshotVersion,
  normalizeSnapshotFormat,
  parseSnapshotVersion
} from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const parsedSnapshot = parseSnapshotVersion(requested);
  const requestedVersion = parsedSnapshot.version;
  const requestedFormat = normalizeSnapshotFormat(
    requestUrl.searchParams.get("format") ?? parsedSnapshot.format
  );

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
    const redirectUrl = new URL(
      getSnapshotPath(game.id, currentVersion, size, requestedFormat),
      req.url
    );
    return NextResponse.redirect(redirectUrl, {
      status: 302,
      headers: {
        "cache-control": "no-store"
      }
    });
  }

  const svg = renderBoardSvg(game.fen, size);
  if (requestedFormat === "svg") {
    return new Response(svg, {
      status: 200,
      headers: {
        "content-type": `${getSnapshotMimeType(requestedFormat)}; charset=utf-8`,
        "cache-control": "public, max-age=31536000, immutable",
        "content-disposition": `inline; filename="${game.id}-${currentVersion}.${requestedFormat}"`
      }
    });
  }

  let rasterized: Buffer;
  try {
    rasterized = await sharp(Buffer.from(svg))
      [requestedFormat === "jpg" ? "jpeg" : "png"](
        requestedFormat === "jpg" ? { quality: 90, progressive: true } : { compressionLevel: 9 }
      )
      .toBuffer();
  } catch {
    return new Response(svg, {
      status: 200,
      headers: {
        "content-type": `${getSnapshotMimeType("svg")}; charset=utf-8`,
        "cache-control": "public, max-age=31536000, immutable",
        "content-disposition": `inline; filename="${game.id}-${currentVersion}.svg"`,
        "x-snapshot-fallback": "svg"
      }
    });
  }

  return new Response(new Uint8Array(rasterized), {
    status: 200,
    headers: {
      "content-type": getSnapshotMimeType(requestedFormat),
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": `inline; filename="${game.id}-${currentVersion}.${requestedFormat}"`
    }
  });
}
