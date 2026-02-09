import { Chess } from "chess.js";
import { z } from "zod";

import { db } from "@/lib/db";
import { sendTurnReminderEmail } from "@/lib/email";

const payloadSchema = z.object({
  gameId: z.string().min(1),
  minMinutesSinceLastMove: z.number().int().min(1).max(60 * 24 * 30).default(60),
  dryRun: z.boolean().default(false)
});

function readReminderKey(req: Request) {
  const headerKey = req.headers.get("x-reminder-key");
  if (headerKey) return headerKey;

  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return null;
}

export async function POST(req: Request) {
  const requiredKey = process.env.REMINDER_API_KEY;
  if (requiredKey) {
    const provided = readReminderKey(req);
    if (provided !== requiredKey) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const input = payloadSchema.safeParse(json);
  if (!input.success) {
    return Response.json(
      { error: "Invalid payload", details: input.error.flatten() },
      { status: 400 }
    );
  }

  const { gameId, minMinutesSinceLastMove, dryRun } = input.data;

  const game = await db.game.findUnique({
    where: { id: gameId },
    include: {
      white: { select: { id: true, email: true, name: true } },
      black: { select: { id: true, email: true, name: true } }
    }
  });

  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "ACTIVE") {
    return Response.json({
      gameId,
      sent: false,
      skippedReason: "Game is not active"
    });
  }

  const chess = new Chess(game.fen);
  const turn = chess.turn();
  const toMoveUser = turn === "w" ? game.white : game.black;

  if (!toMoveUser.email) {
    return Response.json({
      gameId,
      sent: false,
      skippedReason: "Current player has no email"
    });
  }

  const lastMove = await db.move.findFirst({
    where: { gameId },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" }
  });

  const referenceTime = lastMove?.createdAt ?? game.createdAt;
  const minutesSinceLastMove =
    (Date.now() - new Date(referenceTime).getTime()) / 1000 / 60;

  if (minutesSinceLastMove < minMinutesSinceLastMove) {
    return Response.json({
      gameId,
      sent: false,
      skippedReason: `Threshold not met (${Math.floor(
        minutesSinceLastMove
      )} < ${minMinutesSinceLastMove} minutes)`,
      toEmail: toMoveUser.email
    });
  }

  if (dryRun) {
    return Response.json({
      gameId,
      sent: false,
      dryRun: true,
      wouldSendTo: toMoveUser.email,
      minutesSinceLastMove: Math.floor(minutesSinceLastMove)
    });
  }

  const mailResult = await sendTurnReminderEmail({
    toEmail: toMoveUser.email,
    gameId,
    minutesSinceLastMove,
    minMinutesSinceLastMove
  });

  return Response.json({
    gameId,
    toEmail: toMoveUser.email,
    turn,
    minutesSinceLastMove: Math.floor(minutesSinceLastMove),
    ...mailResult
  });
}
