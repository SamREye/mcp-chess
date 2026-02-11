"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import * as Ably from "ably";

import { ChessBoard } from "@/components/chess-board";
import type { ChessBoardAnimation } from "@/components/chess-board";
import { Avatar } from "@/components/avatar";
import { ChatPanel } from "@/components/chat-panel";
import { PlayerCard } from "@/components/player-card";
import { callMcpTool } from "@/lib/mcp-client";

type Piece = {
  square: string;
  type: "p" | "r" | "n" | "b" | "q" | "k";
  color: "w" | "b";
};

type GameData = {
  game: {
    id: string;
    white: { id: string; name: string | null; email: string | null; image: string | null };
    black: { id: string; name: string | null; email: string | null; image: string | null };
    status: string;
    moveCount: number;
    chatCount: number;
    createdAt: string;
    updatedAt: string;
    canMove: boolean;
  };
};

type StatusData = {
  gameId: string;
  fen: string;
  turn: "w" | "b";
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  gameStatus: string;
  pieces: Piece[];
};

type HistoryData = {
  moves: Array<{
    to: string;
    san?: string | null;
    from?: string;
    ply?: number;
    createdAt?: string;
    byUser?: { id: string; email: string | null } | null;
  }>;
};

function getLatestMoveSquare(history: HistoryData): string | null {
  if (history.moves.length === 0) return null;
  return history.moves[history.moves.length - 1]?.to ?? null;
}

const CAPTURE_SORT_ORDER: Record<Piece["type"], number> = {
  q: 0,
  r: 1,
  b: 2,
  n: 3,
  p: 4,
  k: 5
};

const PIECE_GLYPHS: Record<Piece["type"], string> = {
  p: "♟",
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚"
};

type HistoryDisplayMove = {
  key: string;
  plyLabel: string;
  moveLabel: string;
  createdAtLabel: string | null;
  pieceType: Piece["type"];
  pieceColor: Piece["color"];
  player: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

function getCapturedPiecesFromHistory(historyMoves: HistoryData["moves"]) {
  const chess = new Chess();
  const capturedByWhite: Piece["type"][] = [];
  const capturedByBlack: Piece["type"][] = [];

  for (const move of historyMoves) {
    if (!move.san) continue;
    const appliedMove = chess.move(move.san);
    if (!appliedMove || !appliedMove.captured) continue;

    const capturedType = appliedMove.captured as Piece["type"];
    if (appliedMove.color === "w") {
      capturedByWhite.push(capturedType);
    } else {
      capturedByBlack.push(capturedType);
    }
  }

  const sortByMaterial = (pieces: Piece["type"][]) =>
    [...pieces].sort((a, b) => CAPTURE_SORT_ORDER[a] - CAPTURE_SORT_ORDER[b]);

  return {
    white: sortByMaterial(capturedByWhite),
    black: sortByMaterial(capturedByBlack)
  };
}

function buildHistoryDisplayMoves(
  historyMoves: HistoryData["moves"],
  game: GameData["game"] | null
): HistoryDisplayMove[] {
  const chess = new Chess();

  const getPlayerForMove = (
    move: HistoryData["moves"][number],
    pieceColor: Piece["color"]
  ): HistoryDisplayMove["player"] => {
    const byUserId = move.byUser?.id ?? null;
    const byEmail = move.byUser?.email?.trim().toLowerCase() ?? null;

    if (game) {
      const whiteEmail = game.white.email?.trim().toLowerCase() ?? null;
      const blackEmail = game.black.email?.trim().toLowerCase() ?? null;

      if (byUserId && byUserId === game.white.id) return game.white;
      if (byUserId && byUserId === game.black.id) return game.black;
      if (byEmail && whiteEmail && byEmail === whiteEmail) return game.white;
      if (byEmail && blackEmail && byEmail === blackEmail) return game.black;
      return pieceColor === "w" ? game.white : game.black;
    }

    return {
      id: byUserId,
      name: byEmail ? byEmail.split("@")[0] : pieceColor === "w" ? "White" : "Black",
      email: byEmail,
      image: null
    };
  };

  return historyMoves.map((move, index) => {
    let pieceType: Piece["type"] = "p";
    let pieceColor: Piece["color"] =
      ((move.ply ?? index + 1) % 2 === 1 ? "w" : "b") as Piece["color"];

    if (move.san) {
      const applied = chess.move(move.san);
      if (applied) {
        pieceType = applied.piece as Piece["type"];
        pieceColor = applied.color as Piece["color"];
      }
    }

    return {
      key: `${move.ply ?? index}-${move.san ?? move.to}-${index}`,
      plyLabel: move.ply ? `${move.ply}.` : `${index + 1}.`,
      moveLabel: move.san?.trim() || (move.from ? `${move.from}→${move.to}` : move.to),
      createdAtLabel: move.createdAt ? new Date(move.createdAt).toLocaleString() : null,
      pieceType,
      pieceColor,
      player: getPlayerForMove(move, pieceColor)
    };
  });
}

type ChatData = {
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    user: { id: string; name: string | null; email: string | null; image: string | null };
  }>;
};

type MovePieceData = {
  move: {
    to: string;
    promotion?: "q" | "r" | "b" | "n" | null;
  };
};

type ResignGameData = {
  gameId: string;
  gameStatus: string;
  resignedByUserId: string;
  winnerUserId: string;
};

type Toast = {
  id: number;
  level: "warning" | "error";
  message: string;
};

type MobilePane = "board" | "chat";
type PromotionPiece = "q" | "r" | "b" | "n";
type PromotionPrompt = {
  from: string;
  to: string;
  color: "w" | "b";
};

const MOVE_ANIMATION_MS = 180;
const CAPTURE_ANIMATION_MS = 360;
const PROMOTION_LABELS: Record<PromotionPiece, string> = {
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight"
};
const PIECE_SYMBOLS: Record<PromotionPiece, string> = {
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞"
};

function getPiecesFromFen(fen: string): Piece[] {
  const chess = new Chess(fen);
  const board = chess.board();
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const pieces: Piece[] = [];

  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    const rank = 8 - rankIndex;
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const piece = board[rankIndex]?.[fileIndex];
      if (!piece) continue;
      pieces.push({
        square: `${files[fileIndex]}${rank}`,
        type: piece.type,
        color: piece.color
      });
    }
  }

  return pieces;
}

function getEnPassantCaptureSquare(
  to: string,
  color: Piece["color"]
): string | null {
  const file = to[0];
  const rank = Number(to[1]);
  if (!file || Number.isNaN(rank)) return null;
  const captureRank = color === "w" ? rank - 1 : rank + 1;
  if (captureRank < 1 || captureRank > 8) return null;
  return `${file}${captureRank}`;
}

function buildMovePreview(
  currentStatus: StatusData,
  from: string,
  to: string,
  promotion?: PromotionPiece
): { nextStatus: StatusData; moveTo: string; animation: ChessBoardAnimation } | null {
  const moverPiece = currentStatus.pieces.find((piece) => piece.square === from);
  if (!moverPiece) return null;

  const targetPiece = currentStatus.pieces.find((piece) => piece.square === to);
  const chess = new Chess(currentStatus.fen);
  const move = chess.move({ from, to, promotion });
  if (!move) return null;

  let captured:
    | {
        square: string;
        piece: Pick<Piece, "type" | "color">;
      }
    | undefined;

  if (move.flags.includes("e")) {
    const captureSquare = getEnPassantCaptureSquare(to, moverPiece.color);
    const capturedPiece = captureSquare
      ? currentStatus.pieces.find((piece) => piece.square === captureSquare)
      : undefined;
    if (captureSquare && capturedPiece) {
      captured = {
        square: captureSquare,
        piece: { type: capturedPiece.type, color: capturedPiece.color }
      };
    }
  } else if (targetPiece) {
    captured = {
      square: to,
      piece: { type: targetPiece.type, color: targetPiece.color }
    };
  }

  const nextFen = chess.fen();

  return {
    nextStatus: {
      ...currentStatus,
      fen: nextFen,
      turn: chess.turn(),
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isStalemate: chess.isStalemate(),
      isDraw: chess.isDraw(),
      gameStatus: chess.isGameOver() ? "FINISHED" : "ACTIVE",
      pieces: getPiecesFromFen(nextFen)
    },
    moveTo: move.to,
    animation: {
      key: Date.now(),
      mover: {
        from,
        to,
        piece: { type: moverPiece.type, color: moverPiece.color }
      },
      captured
    }
  };
}

export function GameView({
  gameId,
  currentUserId,
  currentUserEmail,
  currentUserName
}: {
  gameId: string;
  currentUserId: string | null;
  currentUserEmail: string | null;
  currentUserName: string | null;
}) {
  const [game, setGame] = useState<GameData["game"] | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [historyMoves, setHistoryMoves] = useState<HistoryData["moves"]>([]);
  const [messages, setMessages] = useState<ChatData["messages"]>([]);
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);
  const [lastMoveSquare, setLastMoveSquare] = useState<string | null>(null);
  const [recentMoveSquare, setRecentMoveSquare] = useState<string | null>(null);
  const [promotionPrompt, setPromotionPrompt] = useState<PromotionPrompt | null>(null);
  const [boardAnimation, setBoardAnimation] = useState<ChessBoardAnimation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMovePending, setIsMovePending] = useState(false);
  const [isResigning, setIsResigning] = useState(false);
  const [isResignConfirmOpen, setIsResignConfirmOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isBoardSyncing, setIsBoardSyncing] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mobilePane, setMobilePane] = useState<MobilePane>("board");
  const [unreadCount, setUnreadCount] = useState(0);
  const toastIdRef = useRef(0);
  const recentMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationResolveRef = useRef<(() => void) | null>(null);
  const statusRef = useRef<StatusData | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const finishBoardAnimation = useCallback(() => {
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    setBoardAnimation(null);
    const resolve = animationResolveRef.current;
    animationResolveRef.current = null;
    resolve?.();
  }, []);

  const playBoardAnimation = useCallback(
    async (animation: ChessBoardAnimation | null) => {
      if (!animation) return;
      finishBoardAnimation();
      setBoardAnimation({ ...animation, key: Date.now() });
      const duration = animation.captured ? CAPTURE_ANIMATION_MS : MOVE_ANIMATION_MS;
      await new Promise<void>((resolve) => {
        animationResolveRef.current = resolve;
        animationTimerRef.current = setTimeout(() => {
          finishBoardAnimation();
        }, duration);
      });
    },
    [finishBoardAnimation]
  );

  const markRecentMove = useCallback((square: string | null) => {
    if (!square) return;
    setLastMoveSquare(square);
    setRecentMoveSquare(square);
    if (recentMoveTimerRef.current) {
      clearTimeout(recentMoveTimerRef.current);
    }
    recentMoveTimerRef.current = setTimeout(() => {
      setRecentMoveSquare((current) => (current === square ? null : current));
    }, 1500);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsChatLoading(true);
    try {
      const [g, s, h, c] = await Promise.all([
        callMcpTool<GameData>("get_game", { gameId }),
        callMcpTool<StatusData>("status", { gameId }),
        callMcpTool<HistoryData>("history", { gameId, limit: 300 }),
        callMcpTool<ChatData>("get_chat_messages", { gameId, limit: 80 })
      ]);
      setGame(g.game);
      setStatus(s);
      setHistoryMoves(h.moves);
      setLastMoveSquare(getLatestMoveSquare(h));
      setRecentMoveSquare(null);
      setMessages(c.messages);
      setUnreadCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load game");
    } finally {
      setLoading(false);
      setIsChatLoading(false);
    }
  }, [gameId]);

  const refreshBoardState = useCallback(async () => {
    setIsBoardSyncing(true);
    try {
      const [g, s, h] = await Promise.all([
        callMcpTool<GameData>("get_game", { gameId }),
        callMcpTool<StatusData>("status", { gameId }),
        callMcpTool<HistoryData>("history", { gameId, limit: 300 })
      ]);
      setGame(g.game);
      setStatus(s);
      setHistoryMoves(h.moves);
      setLastMoveSquare(getLatestMoveSquare(h));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh game state");
    } finally {
      setIsBoardSyncing(false);
    }
  }, [gameId]);

  const refreshChat = useCallback(
    async (showLoader = false) => {
      if (showLoader) setIsChatLoading(true);
      try {
        const chat = await callMcpTool<ChatData>("get_chat_messages", {
          gameId,
          limit: 80
        });
        setMessages(chat.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load chat");
      } finally {
        if (showLoader) setIsChatLoading(false);
      }
    },
    [gameId]
  );

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (mobilePane === "chat") {
      setUnreadCount(0);
    }
  }, [mobilePane]);

  useEffect(() => {
    const client = new Ably.Realtime({
      authUrl: "/api/ably/token",
      autoConnect: true,
      closeOnUnload: true
    });
    const channel = client.channels.get(`game:${gameId}`);

    const onMessage = (message: Ably.Message) => {
      if (message.name === "chat.created") {
        void refreshChat();
        const byCurrentUser =
          typeof message.data === "object" &&
          message.data !== null &&
          "userId" in message.data &&
          message.data.userId === currentUserId;
        if (!byCurrentUser && mobilePane !== "chat") {
          setUnreadCount((count) => count + 1);
        }
        return;
      }

      if (message.name === "move.created") {
        const payload =
          typeof message.data === "object" && message.data !== null ? message.data : null;
        const moveFrom =
          payload && "from" in payload && typeof payload.from === "string" ? payload.from : null;
        const moveTo =
          payload && "to" in payload && typeof payload.to === "string" ? payload.to : null;
        const movePromotion =
          payload &&
          "promotion" in payload &&
          typeof payload.promotion === "string" &&
          ["q", "r", "b", "n"].includes(payload.promotion)
            ? (payload.promotion as PromotionPiece)
            : undefined;
        const byUserId =
          payload && "byUserId" in payload && typeof payload.byUserId === "string"
            ? payload.byUserId
            : null;
        const byCurrentUser = Boolean(currentUserId && byUserId === currentUserId);

        if (!byCurrentUser && moveFrom && moveTo && statusRef.current) {
          const preview = buildMovePreview(statusRef.current, moveFrom, moveTo, movePromotion);
          if (preview) {
            void (async () => {
              await playBoardAnimation(preview.animation);
              setStatus(preview.nextStatus);
              setGame((prev) =>
                prev
                  ? {
                      ...prev,
                      moveCount: prev.moveCount + 1,
                      status: preview.nextStatus.gameStatus
                    }
                  : prev
              );
              markRecentMove(preview.moveTo);
              void refreshBoardState();
            })();
            return;
          }
        }

        markRecentMove(moveTo);
        void refreshBoardState();
        return;
      }

      if (message.name === "game.finished" || message.name === "game.created") {
        void refreshBoardState();
        return;
      }
    };

    channel.subscribe(onMessage);

    return () => {
      try {
        channel.unsubscribe(onMessage);
      } catch {
        // Ignore teardown errors if channel/client are already closed.
      }

      try {
        client.channels.release(`game:${gameId}`);
      } catch {
        // Ignore teardown errors if channel/client are already closed.
      }

      try {
        client.close();
      } catch {
        // Ignore teardown errors if connection is already closed.
      }
    };
  }, [
    gameId,
    currentUserId,
    markRecentMove,
    mobilePane,
    playBoardAnimation,
    refreshBoardState,
    refreshChat
  ]);

  useEffect(() => {
    return () => {
      if (recentMoveTimerRef.current) {
        clearTimeout(recentMoveTimerRef.current);
      }
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
      const resolve = animationResolveRef.current;
      animationResolveRef.current = null;
      resolve?.();
    };
  }, []);

  useEffect(() => {
    if (!promotionPrompt) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPromotionPrompt(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [promotionPrompt]);

  useEffect(() => {
    if (!(isResignConfirmOpen || isHistoryOpen || isActionsOpen)) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsActionsOpen(false);
        setIsHistoryOpen(false);
        setIsResignConfirmOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isActionsOpen, isHistoryOpen, isResignConfirmOpen]);

  useEffect(() => {
    if (!isActionsOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (actionsMenuRef.current?.contains(target)) return;
      setIsActionsOpen(false);
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [isActionsOpen]);

  const piecesBySquare = useMemo(() => {
    const map = new Map<string, Piece>();
    for (const p of status?.pieces ?? []) {
      map.set(p.square, p);
    }
    return map;
  }, [status?.pieces]);

  const myColor = useMemo(() => {
    if (!game) return null;
    if (currentUserId) {
      if (game.white.id === currentUserId) return "w" as const;
      if (game.black.id === currentUserId) return "b" as const;
    }
    const normalizedCurrentEmail = currentUserEmail?.trim().toLowerCase();
    if (normalizedCurrentEmail) {
      if (game.white.email?.trim().toLowerCase() === normalizedCurrentEmail) return "w" as const;
      if (game.black.email?.trim().toLowerCase() === normalizedCurrentEmail) return "b" as const;
    }

    const normalizedCurrentName = currentUserName?.trim().toLowerCase();
    if (normalizedCurrentName) {
      if (game.white.name?.trim().toLowerCase() === normalizedCurrentName) return "w" as const;
      if (game.black.name?.trim().toLowerCase() === normalizedCurrentName) return "b" as const;
    }

    return null;
  }, [game, currentUserEmail, currentUserId, currentUserName]);

  const selfChatUser = useMemo(() => {
    if (!game || !myColor) return null;
    const player = myColor === "w" ? game.white : game.black;
    return {
      id: player.id,
      email: player.email,
      name: player.name
    };
  }, [game, myColor]);

  const isGameActive = status?.gameStatus === "ACTIVE";
  const canChat = Boolean(myColor && currentUserId);
  const canPlay = Boolean(game?.canMove && myColor && isGameActive);
  const isMyTurn = Boolean(canPlay && status?.turn === myColor);

  const statusMessage = useMemo(() => {
    if (!status) return "";

    if (status.isCheckmate) {
      if (myColor) {
        const winnerColor = status.turn === "w" ? "b" : "w";
        return `Check mate! You ${winnerColor === myColor ? "win" : "lose"}!`;
      }
      return "Check mate!";
    }

    if (status.isDraw || status.isStalemate) {
      return "Game over: Draw.";
    }

    if (isMyTurn) {
      return status.isCheck ? "Check! Your turn to move" : "Your turn to move";
    }

    if (canPlay) {
      return status.isCheck ? "Check! Opponent to move" : "Waiting for opponent to move";
    }

    if (!isGameActive) {
      return "Game finished.";
    }

    return "Viewing game";
  }, [status, isMyTurn, canPlay, isGameActive, myColor]);

  const statusClassName = useMemo(() => {
    if (!status) return "spectator-turn";
    if (status.isCheckmate) return "waiting-turn";
    if (status.isDraw || status.isStalemate) return "spectator-turn";
    if (isMyTurn) return "my-turn";
    if (canPlay) return "waiting-turn";
    return "spectator-turn";
  }, [status, isMyTurn, canPlay]);

  const capturedPieces = useMemo(
    () => getCapturedPiecesFromHistory(historyMoves),
    [historyMoves]
  );
  const historyDisplayMoves = useMemo(
    () => buildHistoryDisplayMoves(historyMoves, game),
    [historyMoves, game]
  );

  function pushToast(level: Toast["level"], message: string) {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((prev) => [...prev, { id, level, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }

  async function submitMove(from: string, to: string, promotion?: PromotionPiece) {
    if (!status) return;

    const preview = buildMovePreview(status, from, to, promotion);
    if (!preview) {
      pushToast("error", "Illegal move.");
      return;
    }

    const previousStatus = status;
    const previousGame = game;
    const previousLastMove = lastMoveSquare;
    const moveArgs: { gameId: string; from: string; to: string; promotion?: PromotionPiece } = {
      gameId,
      from,
      to
    };

    if (promotion) {
      moveArgs.promotion = promotion;
    }

    setError(null);
    await playBoardAnimation(preview.animation);
    setStatus(preview.nextStatus);
    setGame((prev) =>
      prev
        ? {
            ...prev,
            moveCount: prev.moveCount + 1,
            status: preview.nextStatus.gameStatus
          }
        : prev
    );
    markRecentMove(preview.moveTo);
    setIsMovePending(true);

    try {
      const result = await callMcpTool<MovePieceData>("move_piece", moveArgs);
      markRecentMove(result.move.to);
      await refreshBoardState();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Move failed";
      setError(message);
      setStatus(previousStatus);
      setGame(previousGame);
      setLastMoveSquare(previousLastMove);
      setRecentMoveSquare(null);
      setBoardAnimation(null);
      if (message.includes("Illegal move")) {
        pushToast(
          "error",
          "Illegal move. This move would break chess rules (for example, exposing your king)."
        );
      } else if (message.includes("not your turn")) {
        pushToast("warning", "Not your turn.");
      }
      void refreshBoardState();
    } finally {
      setIsMovePending(false);
    }
  }

  async function handleSquareClick(square: string) {
    if (!status || !game?.canMove || !myColor || isMovePending) return;
    if (status.turn !== myColor) {
      pushToast("warning", "Not your turn.");
      return;
    }

    if (!selectedFrom) {
      const piece = piecesBySquare.get(square);
      if (!piece || piece.color !== myColor) {
        pushToast("warning", "Select one of your pieces first.");
        return;
      }
      setSelectedFrom(square);
      return;
    }

    if (selectedFrom === square) {
      setSelectedFrom(null);
      return;
    }

    const targetPiece = piecesBySquare.get(square);
    if (targetPiece?.color === myColor) {
      setSelectedFrom(square);
      return;
    }

    const chess = new Chess(status.fen);
    const legalMoves = chess.moves({ square: selectedFrom as Square, verbose: true });
    const matchingMoves = legalMoves.filter((move) => move.to === (square as Square));
    if (matchingMoves.length === 0) {
      pushToast("warning", "That destination is not legal for the selected piece.");
      return;
    }

    const promotionChoices = Array.from(
      new Set(
        matchingMoves
          .map((move) => move.promotion)
          .filter((promotion): promotion is PromotionPiece => Boolean(promotion))
      )
    );
    if (promotionChoices.length > 0) {
      const moverPiece = piecesBySquare.get(selectedFrom);
      setPromotionPrompt({
        from: selectedFrom,
        to: square,
        color: moverPiece?.color ?? myColor
      });
      setSelectedFrom(null);
      return;
    }

    setSelectedFrom(null);
    await submitMove(selectedFrom, square);
  }

  async function handlePromotionSelect(promotion: PromotionPiece) {
    if (!promotionPrompt) return;
    const choice = promotionPrompt;
    setPromotionPrompt(null);
    await submitMove(choice.from, choice.to, promotion);
  }

  async function handleConfirmResign() {
    if (!canPlay || isResigning) return;
    setIsResigning(true);
    setError(null);
    setSelectedFrom(null);

    try {
      await callMcpTool<ResignGameData>("resign_game", { gameId });
      setIsResignConfirmOpen(false);
      await refreshBoardState();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resign game";
      setError(message);
      if (message.includes("not active")) {
        pushToast("warning", "Game is already finished.");
      } else if (message.includes("Only game players")) {
        pushToast("warning", "Only players in this game can resign.");
      } else {
        pushToast("error", "Unable to resign right now.");
      }
      void refreshBoardState();
    } finally {
      setIsResigning(false);
    }
  }

  function openHistoryModal() {
    setIsActionsOpen(false);
    setIsHistoryOpen(true);
  }

  function openResignModal() {
    setIsActionsOpen(false);
    setIsResignConfirmOpen(true);
  }

  async function sendMessage(body: string) {
    await callMcpTool("post_chat_message", {
      gameId,
      body
    });
    await refreshChat(true);
    setUnreadCount(0);
  }

  if (loading) {
    return <p className="muted">Loading game...</p>;
  }

  if (!game || !status) {
    return <p className="error">Game unavailable.</p>;
  }

  return (
    <div className="stack game-view">
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast ${toast.level === "error" ? "toast-error" : "toast-warning"}`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <section className="panel stack game-panel">
        <div className="game-head-row">
          <div className="game-head">
            <div className="game-head-player-stack">
              <PlayerCard player={game.white} className="game-head-player-card" pieceColor="white" />
              <div className="captured-row captured-row-white" aria-label="Pieces captured by White">
                {capturedPieces.white.length > 0 ? (
                  capturedPieces.white.map((piece, index) => (
                    <span
                      key={`white-captured-${piece}-${index}`}
                      className="piece piece-b captured-piece"
                      title="Captured black piece"
                    >
                      {PIECE_GLYPHS[piece]}
                    </span>
                  ))
                ) : (
                  <span className="captured-empty">No captures</span>
                )}
              </div>
            </div>
            <span className="game-head-vs">vs</span>
            <div className="game-head-player-stack">
              <PlayerCard player={game.black} className="game-head-player-card" pieceColor="black" />
              <div className="captured-row captured-row-black" aria-label="Pieces captured by Black">
                {capturedPieces.black.length > 0 ? (
                  capturedPieces.black.map((piece, index) => (
                    <span
                      key={`black-captured-${piece}-${index}`}
                      className="piece piece-w captured-piece"
                      title="Captured white piece"
                    >
                      {PIECE_GLYPHS[piece]}
                    </span>
                  ))
                ) : (
                  <span className="captured-empty">No captures</span>
                )}
              </div>
            </div>
          </div>
          <div className="game-status-actions">
            <div className={`turn-banner game-status-pill ${statusClassName}`}>
              {statusMessage}
              {(isMovePending || isBoardSyncing || isResigning) && (
                <span className="inline-loader">
                  {isResigning
                    ? " Resigning..."
                    : isMovePending
                      ? " Applying move..."
                      : " Syncing..."}
                </span>
              )}
            </div>
            <div className="game-actions-menu" ref={actionsMenuRef}>
              <button
                type="button"
                className="overflow-btn"
                onClick={() => setIsActionsOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={isActionsOpen}
                title="Game actions"
              >
                ⋯
              </button>
              {isActionsOpen && (
                <div className="overflow-menu" role="menu">
                  <button
                    type="button"
                    className="overflow-menu-item"
                    role="menuitem"
                    onClick={openHistoryModal}
                  >
                    Move history
                  </button>
                  {canPlay && (
                    <button
                      type="button"
                      className="overflow-menu-item overflow-menu-item-danger"
                      role="menuitem"
                      onClick={openResignModal}
                      disabled={isMovePending || isBoardSyncing || isResigning}
                    >
                      Resign
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mobile-switch">
          <button
            type="button"
            className={`mobile-switch-btn ${mobilePane === "board" ? "active" : ""}`}
            onClick={() => setMobilePane("board")}
          >
            Board
          </button>
          <button
            type="button"
            className={`mobile-switch-btn ${mobilePane === "chat" ? "active" : ""}`}
            onClick={() => setMobilePane("chat")}
          >
            Chat
            {unreadCount > 0 && <span className="tab-badge">{unreadCount}</span>}
          </button>
        </div>

        <div className="game-main">
          <section className={`game-board-pane ${mobilePane === "board" ? "is-active" : ""}`}>
            <div className="board-wrap">
              <ChessBoard
                pieces={status.pieces}
                selectedSquare={selectedFrom}
                lastMoveSquare={lastMoveSquare}
                recentMoveSquare={recentMoveSquare}
                animation={boardAnimation}
                onSquareClick={(sq) => void handleSquareClick(sq)}
                interactive={isMyTurn && !isMovePending && !boardAnimation && !promotionPrompt}
                orientation={myColor === "b" ? "black" : "white"}
              />
              {((isMovePending && !boardAnimation) || isBoardSyncing || isResigning) && (
                <div className="board-overlay" aria-live="polite">
                  <span className="loader-dot" />
                  <span>
                    {isResigning
                      ? "Resigning game..."
                      : isMovePending
                        ? "Applying move..."
                        : "Syncing board..."}
                  </span>
                </div>
              )}
            </div>
          </section>

          <aside className={`game-chat-pane ${mobilePane === "chat" ? "is-active" : ""}`}>
            {isChatLoading && <p className="muted">Loading chat...</p>}
            <ChatPanel
              messages={messages}
              selfUser={selfChatUser}
              canSend={canChat}
              onSend={sendMessage}
            />
          </aside>
        </div>
      </section>

      {promotionPrompt && (
        <div className="modal-backdrop">
          <div
            className="promotion-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="promotion-title"
          >
            <h3 id="promotion-title">Choose a promotion piece</h3>
            <div className="promotion-grid">
              {(["q", "r", "b", "n"] as PromotionPiece[]).map((promotion) => (
                <button
                  key={promotion}
                  type="button"
                  className="promotion-option"
                  onClick={() => void handlePromotionSelect(promotion)}
                >
                  <span className={`piece piece-${promotionPrompt.color} promotion-piece`}>
                    {PIECE_SYMBOLS[promotion]}
                  </span>
                  <span>{PROMOTION_LABELS[promotion]}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="promotion-cancel"
              onClick={() => setPromotionPrompt(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isHistoryOpen && (
        <div className="modal-backdrop" onClick={() => setIsHistoryOpen(false)}>
          <div
            className="promotion-modal history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="history-modal-head">
              <h3 id="history-title">Move history</h3>
              <button
                type="button"
                className="new-game-close"
                onClick={() => setIsHistoryOpen(false)}
              >
                Close
              </button>
            </div>
            {historyDisplayMoves.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No moves yet.
              </p>
            ) : (
              <ol className="history-list">
                {historyDisplayMoves.map((move) => {
                  const avatarFallback =
                    move.player.name?.trim()?.[0] ?? move.player.email?.trim()?.[0] ?? "?";
                  return (
                    <li key={move.key} className="history-item">
                      <div className="history-item-player">
                        <Avatar
                          email={move.player.email}
                          name={move.player.name}
                          image={move.player.image}
                          fallback={avatarFallback.toUpperCase()}
                          className="history-item-avatar"
                          title={move.player.email ?? move.player.name ?? "Player"}
                        />
                        <span
                          className={`piece piece-${move.pieceColor} history-item-piece`}
                          title="Moved piece"
                        >
                          {PIECE_GLYPHS[move.pieceType]}
                        </span>
                      </div>
                      <div className="history-item-main">
                        <span className="history-item-ply">{move.plyLabel}</span>
                        <span className="history-item-san">{move.moveLabel}</span>
                      </div>
                      {move.createdAtLabel && (
                        <span className="history-item-time">{move.createdAtLabel}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}

      {isResignConfirmOpen && (
        <div className="modal-backdrop" onClick={() => setIsResignConfirmOpen(false)}>
          <div
            className="promotion-modal resign-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resign-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="resign-title">Resign game?</h3>
            <p className="muted" style={{ margin: 0 }}>
              This will immediately end the game and award the win to your opponent.
            </p>
            <div className="resign-actions">
              <button
                type="button"
                className="promotion-cancel"
                onClick={() => setIsResignConfirmOpen(false)}
                disabled={isResigning}
              >
                Cancel
              </button>
              <button
                type="button"
                className="resign-btn"
                onClick={() => void handleConfirmResign()}
                disabled={isResigning}
              >
                {isResigning ? "Resigning..." : "Confirm resign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
