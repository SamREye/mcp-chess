import { GameStatus } from "@prisma/client";
import { Chess } from "chess.js";
import { z } from "zod";

import { publishGameEvent, publishGamesEvent } from "@/lib/ably-server";
import { db } from "@/lib/db";
import { getPiecesFromFen } from "@/lib/chess-utils";
import { sendGameInvitationEmail } from "@/lib/email";
import { getSnapshotPath, getSnapshotVersion } from "@/lib/snapshot";

type ToolContext = {
  userId: string | null;
};

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: unknown, ctx: ToolContext) => Promise<unknown>;
};

function requireAuth(userId: string | null): string {
  if (!userId) {
    throw new Error("Authentication required");
  }
  return userId;
}

const queryUsersInput = z
  .object({
    query: z.string().trim().optional(),
    email: z.string().trim().optional(),
    name: z.string().trim().optional(),
    limit: z.number().int().min(1).max(50).default(20)
  })
  .transform((raw) => ({
    term: (raw.query ?? raw.email ?? raw.name ?? "").trim(),
    limit: raw.limit
  }));

const newGameInput = z.object({
  opponentEmail: z.string().email().transform((value) => value.trim().toLowerCase()),
  playAs: z.enum(["white", "black"]).default("white")
});

const movePieceInput = z.object({
  gameId: z.string().min(1),
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(["q", "r", "b", "n"]).optional()
});

const gameIdInput = z.object({
  gameId: z.string().min(1)
});

const snapshotInput = z.object({
  gameId: z.string().min(1),
  size: z.number().int().min(200).max(1200).default(560)
});

const historyInput = z.object({
  gameId: z.string().min(1),
  limit: z.number().int().min(1).max(300).default(200)
});

const listGamesInput = z.object({
  scope: z.enum(["my", "others", "all"]).default("all"),
  limit: z.number().int().min(1).max(100).default(30)
});

const postChatInput = z.object({
  gameId: z.string().min(1),
  body: z.string().trim().min(1).max(500)
});

const getChatInput = z.object({
  gameId: z.string().min(1),
  limit: z.number().int().min(1).max(200).default(50)
});

async function getStatusForGame(gameId: string) {
  const game = await db.game.findUnique({ where: { id: gameId } });
  if (!game || !game.isPublic) throw new Error("Game not found");

  const chess = new Chess(game.fen);

  return {
    gameId: game.id,
    fen: game.fen,
    turn: chess.turn(),
    isCheck: chess.isCheck(),
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    isDraw: chess.isDraw(),
    gameStatus: game.status,
    pieces: getPiecesFromFen(game.fen)
  };
}

async function getHistoryForGame(gameId: string, limit: number) {
  const game = await db.game.findUnique({ where: { id: gameId } });
  if (!game || !game.isPublic) throw new Error("Game not found");

  const moves = await db.move.findMany({
    where: { gameId },
    orderBy: { ply: "asc" },
    include: {
      byUser: { select: { id: true, email: true } }
    },
    take: limit
  });

  return {
    gameId,
    moves: moves.map((m) => ({
      id: m.id,
      ply: m.ply,
      san: m.san,
      from: m.from,
      to: m.to,
      byUser: m.byUser,
      createdAt: m.createdAt
    }))
  };
}

export const toolDefs: ToolDef[] = [
  {
    name: "query_users_by_email",
    description: "Search users by email and/or name.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        email: { type: "string" },
        name: { type: "string" },
        limit: { type: "number" }
      }
    },
    execute: async (args) => {
      const input = queryUsersInput.parse(args ?? {});
      const where = input.term
        ? {
            AND: [
              { email: { not: null } },
              { OR: [{ email: { contains: input.term } }, { name: { contains: input.term } }] }
            ]
          }
        : { email: { not: null } };

      const users = await db.user.findMany({
        where,
        select: { id: true, name: true, email: true, image: true },
        orderBy: [{ email: "asc" }, { createdAt: "desc" }],
        take: input.limit
      });

      return { users };
    }
  },
  {
    name: "new_game",
    description: "Create a new game against an email and send invitation email.",
    inputSchema: {
      type: "object",
      properties: {
        opponentEmail: { type: "string", format: "email" },
        playAs: { type: "string", enum: ["white", "black"] }
      },
      required: ["opponentEmail"]
    },
    execute: async (args, ctx) => {
      const userId = requireAuth(ctx.userId);
      const input = newGameInput.parse(args ?? {});

      const me = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true }
      });
      if (!me) {
        throw new Error("Authenticated user not found");
      }

      if (me.email?.toLowerCase() === input.opponentEmail) {
        throw new Error("Cannot create a game against yourself");
      }

      let opponent = await db.user.findUnique({
        where: { email: input.opponentEmail },
        select: { id: true, email: true, name: true }
      });

      let opponentExists = true;
      if (!opponent) {
        opponentExists = false;
        opponent = await db.user.create({
          data: { email: input.opponentEmail },
          select: { id: true, email: true, name: true }
        });
      }

      const chess = new Chess();
      const whiteId = input.playAs === "white" ? userId : opponent.id;
      const blackId = input.playAs === "black" ? userId : opponent.id;

      const game = await db.game.create({
        data: {
          whiteId,
          blackId,
          createdById: userId,
          fen: chess.fen(),
          pgn: chess.pgn(),
          isPublic: true
        },
        include: {
          white: { select: { id: true, email: true, name: true } },
          black: { select: { id: true, email: true, name: true } }
        }
      });

      const invitation = await sendGameInvitationEmail({
        toEmail: input.opponentEmail,
        invitedByEmail: me.email,
        invitedByName: me.name,
        gameId: game.id,
        opponentExists
      });

      await publishGameEvent(game.id, "game.created", {
        whiteId: game.white.id,
        blackId: game.black.id
      });
      await publishGamesEvent("game.created", { gameId: game.id });

      return {
        game: {
          id: game.id,
          white: game.white,
          black: game.black,
          status: game.status,
          fen: game.fen,
          createdAt: game.createdAt
        },
        invitation
      };
    }
  },
  {
    name: "move_piece",
    description: "Move a piece in a game (authenticated game players only).",
    inputSchema: {
      type: "object",
      properties: {
        gameId: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        promotion: { type: "string", enum: ["q", "r", "b", "n"] }
      },
      required: ["gameId", "from", "to"]
    },
    execute: async (args, ctx) => {
      const userId = requireAuth(ctx.userId);
      const input = movePieceInput.parse(args ?? {});

      const result = await db.$transaction(async (tx) => {
        const game = await tx.game.findUnique({ where: { id: input.gameId } });
        if (!game) throw new Error("Game not found");
        if (game.status !== GameStatus.ACTIVE) throw new Error("Game is not active");

        const playerColor = userId === game.whiteId ? "w" : userId === game.blackId ? "b" : null;
        if (!playerColor) {
          throw new Error("Only game players can move pieces");
        }

        const chess = new Chess(game.fen);
        if (chess.turn() !== playerColor) {
          throw new Error("It is not your turn");
        }

        const fenBefore = chess.fen();
        const move = chess.move({
          from: input.from,
          to: input.to,
          promotion: input.promotion
        });

        if (!move) {
          throw new Error("Illegal move");
        }

        const fenAfter = chess.fen();
        const ply = await tx.move.count({ where: { gameId: game.id } });
        const nextStatus = chess.isGameOver() ? GameStatus.FINISHED : GameStatus.ACTIVE;

        await tx.game.update({
          where: { id: game.id },
          data: {
            fen: fenAfter,
            pgn: chess.pgn(),
            status: nextStatus
          }
        });

        const dbMove = await tx.move.create({
          data: {
            gameId: game.id,
            byUserId: userId,
            from: input.from,
            to: input.to,
            promotion: input.promotion,
            san: move.san,
            fenBefore,
            fenAfter,
            ply: ply + 1
          }
        });

        return {
          move: {
            id: dbMove.id,
            san: dbMove.san,
            from: dbMove.from,
            to: dbMove.to,
            ply: dbMove.ply,
            createdAt: dbMove.createdAt
          },
          fen: fenAfter,
          gameStatus: nextStatus,
          isCheckmate: chess.isCheckmate(),
          isDraw: chess.isDraw(),
          winnerUserId: chess.isCheckmate() ? userId : null
        };
      });

      await publishGameEvent(input.gameId, "move.created", {
        moveId: result.move.id,
        byUserId: userId,
        san: result.move.san,
        from: result.move.from,
        to: result.move.to,
        gameStatus: result.gameStatus
      });
      await publishGamesEvent("game.updated", { gameId: input.gameId });

      if (result.gameStatus === GameStatus.FINISHED) {
        await publishGameEvent(input.gameId, "game.finished", {
          winnerUserId: result.winnerUserId,
          isCheckmate: result.isCheckmate,
          isDraw: result.isDraw
        });
      }

      return result;
    }
  },
  {
    name: "snapshot",
    description:
      "Return a public URL for the current board snapshot image for a game, plus metadata.",
    inputSchema: {
      type: "object",
      properties: {
        gameId: { type: "string" },
        size: { type: "number" }
      },
      required: ["gameId"]
    },
    execute: async (args) => {
      const input = snapshotInput.parse(args ?? {});
      const game = await db.game.findUnique({ where: { id: input.gameId } });
      if (!game || !game.isPublic) throw new Error("Game not found");

      const version = getSnapshotVersion(game.updatedAt);
      const snapshotPath = getSnapshotPath(game.id, version, input.size);

      return {
        gameId: game.id,
        version,
        snapshotPath,
        mimeType: "image/svg+xml"
      };
    }
  },
  {
    name: "status",
    description: "Get the game status and piece positions.",
    inputSchema: {
      type: "object",
      properties: {
        gameId: { type: "string" }
      },
      required: ["gameId"]
    },
    execute: async (args) => {
      const input = gameIdInput.parse(args ?? {});
      return getStatusForGame(input.gameId);
    }
  },
  {
    name: "get_game_status",
    description: "Alias for status: get the game status and piece positions.",
    inputSchema: {
      type: "object",
      properties: {
        gameId: { type: "string" }
      },
      required: ["gameId"]
    },
    execute: async (args) => {
      const input = gameIdInput.parse(args ?? {});
      return getStatusForGame(input.gameId);
    }
  },
  {
    name: "history",
    description: "Get chronological move history.",
    inputSchema: {
      type: "object",
      properties: {
        gameId: { type: "string" },
        limit: { type: "number" }
      },
      required: ["gameId"]
    },
    execute: async (args) => {
      const input = historyInput.parse(args ?? {});
      return getHistoryForGame(input.gameId, input.limit);
    }
  },
  {
    name: "get_game_history",
    description: "Alias for history: get chronological move history.",
    inputSchema: {
      type: "object",
      properties: {
        gameId: { type: "string" },
        limit: { type: "number" }
      },
      required: ["gameId"]
    },
    execute: async (args) => {
      const input = historyInput.parse(args ?? {});
      return getHistoryForGame(input.gameId, input.limit);
    }
  },
  {
    name: "list_games",
    description: "List public games, with my/others scopes for authenticated users.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["my", "others", "all"] },
        limit: { type: "number" }
      }
    },
    execute: async (args, ctx) => {
      const input = listGamesInput.parse(args ?? {});

      let where: Record<string, unknown> = { isPublic: true };
      if (input.scope === "my") {
        const userId = requireAuth(ctx.userId);
        where = {
          isPublic: true,
          OR: [{ whiteId: userId }, { blackId: userId }]
        };
      }

      if (input.scope === "others") {
        if (ctx.userId) {
          where = {
            isPublic: true,
            AND: [
              {
                NOT: {
                  OR: [{ whiteId: ctx.userId }, { blackId: ctx.userId }]
                }
              }
            ]
          };
        }
      }

      const games = await db.game.findMany({
        where,
        include: {
          white: { select: { id: true, email: true } },
          black: { select: { id: true, email: true } },
          _count: { select: { moves: true } }
        },
        orderBy: { updatedAt: "desc" },
        take: input.limit
      });

      return {
        games: games.map((g) => ({
          id: g.id,
          white: g.white,
          black: g.black,
          status: g.status,
          moveCount: g._count.moves,
          updatedAt: g.updatedAt,
          createdAt: g.createdAt
        }))
      };
    }
  },
  {
    name: "get_game",
    description: "Get one game's metadata.",
    inputSchema: {
      type: "object",
      properties: {
        gameId: { type: "string" }
      },
      required: ["gameId"]
    },
    execute: async (args, ctx) => {
      const input = gameIdInput.parse(args ?? {});
      const game = await db.game.findUnique({
        where: { id: input.gameId },
        include: {
          white: { select: { id: true, email: true, image: true } },
          black: { select: { id: true, email: true, image: true } },
          _count: { select: { moves: true, chatMessages: true } }
        }
      });
      if (!game || !game.isPublic) throw new Error("Game not found");

      return {
        game: {
          id: game.id,
          white: game.white,
          black: game.black,
          status: game.status,
          moveCount: game._count.moves,
          chatCount: game._count.chatMessages,
          createdAt: game.createdAt,
          updatedAt: game.updatedAt,
          canMove:
            game.status === GameStatus.ACTIVE &&
            (ctx.userId === game.whiteId || ctx.userId === game.blackId)
        }
      };
    }
  },
  {
    name: "get_chat_messages",
    description: "Get per-game chat messages.",
    inputSchema: {
      type: "object",
      properties: {
        gameId: { type: "string" },
        limit: { type: "number" }
      },
      required: ["gameId"]
    },
    execute: async (args) => {
      const input = getChatInput.parse(args ?? {});
      const game = await db.game.findUnique({ where: { id: input.gameId } });
      if (!game || !game.isPublic) throw new Error("Game not found");

      const messages = await db.chatMessage.findMany({
        where: { gameId: input.gameId },
        include: {
          user: { select: { id: true, email: true, image: true } }
        },
        orderBy: { createdAt: "asc" },
        take: input.limit
      });

      return {
        gameId: input.gameId,
        messages: messages.map((m) => ({
          id: m.id,
          body: m.body,
          createdAt: m.createdAt,
          user: m.user
        }))
      };
    }
  },
  {
    name: "post_chat_message",
    description: "Post a message to a game's chat (players only).",
    inputSchema: {
      type: "object",
      properties: {
        gameId: { type: "string" },
        body: { type: "string" }
      },
      required: ["gameId", "body"]
    },
    execute: async (args, ctx) => {
      const userId = requireAuth(ctx.userId);
      const input = postChatInput.parse(args ?? {});

      const game = await db.game.findUnique({ where: { id: input.gameId } });
      if (!game || !game.isPublic) throw new Error("Game not found");

      if (game.whiteId !== userId && game.blackId !== userId) {
        throw new Error("Only game players can post chat messages");
      }

      const message = await db.chatMessage.create({
        data: {
          gameId: input.gameId,
          userId,
          body: input.body
        },
        include: {
          user: { select: { id: true, email: true, image: true } }
        }
      });

      await publishGameEvent(input.gameId, "chat.created", {
        messageId: message.id,
        userId
      });

      return {
        message: {
          id: message.id,
          body: message.body,
          createdAt: message.createdAt,
          user: message.user
        }
      };
    }
  }
];

export async function executeTool(name: string, args: unknown, ctx: ToolContext) {
  const tool = toolDefs.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return tool.execute(args, ctx);
}
