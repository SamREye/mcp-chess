"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import * as Ably from "ably";

import { Avatar } from "@/components/avatar";
import { ChessBoard } from "@/components/chess-board";
import type { ChessBoardAnimation } from "@/components/chess-board";
import { ChatPanel } from "@/components/chat-panel";
import { callMcpTool } from "@/lib/mcp-client";

type Piece = {
  square: string;
  type: "p" | "r" | "n" | "b" | "q" | "k";
  color: "w" | "b";
};

type GameData = {
  game: {
    id: string;
    white: { id: string; email: string | null; image: string | null };
    black: { id: string; email: string | null; image: string | null };
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
  }>;
};

type ChatData = {
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    user: { id: string; email: string | null; image: string | null };
  }>;
};

type MovePieceData = {
  move: {
    to: string;
  };
};

type Toast = {
  id: number;
  level: "warning" | "error";
  message: string;
};

type MobilePane = "board" | "chat";
const MOVE_ANIMATION_MS = 180;
const CAPTURE_ANIMATION_MS = 360;

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
  promotion: "q" | "r" | "b" | "n" = "q"
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
  currentUserId
}: {
  gameId: string;
  currentUserId: string | null;
}) {
  const [game, setGame] = useState<GameData["game"] | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [messages, setMessages] = useState<ChatData["messages"]>([]);
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);
  const [lastMoveSquare, setLastMoveSquare] = useState<string | null>(null);
  const [recentMoveSquare, setRecentMoveSquare] = useState<string | null>(null);
  const [boardAnimation, setBoardAnimation] = useState<ChessBoardAnimation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMovePending, setIsMovePending] = useState(false);
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
        callMcpTool<HistoryData>("history", { gameId, limit: 1 }),
        callMcpTool<ChatData>("get_chat_messages", { gameId, limit: 80 })
      ]);
      setGame(g.game);
      setStatus(s);
      setLastMoveSquare(h.moves[0]?.to ?? null);
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
        callMcpTool<HistoryData>("history", { gameId, limit: 1 })
      ]);
      setGame(g.game);
      setStatus(s);
      setLastMoveSquare(h.moves[0]?.to ?? null);
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
        const byUserId =
          payload && "byUserId" in payload && typeof payload.byUserId === "string"
            ? payload.byUserId
            : null;
        const byCurrentUser = Boolean(currentUserId && byUserId === currentUserId);

        if (!byCurrentUser && moveFrom && moveTo && statusRef.current) {
          const preview = buildMovePreview(statusRef.current, moveFrom, moveTo);
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

  const piecesBySquare = useMemo(() => {
    const map = new Map<string, Piece>();
    for (const p of status?.pieces ?? []) {
      map.set(p.square, p);
    }
    return map;
  }, [status?.pieces]);

  const myColor = useMemo(() => {
    if (!game || !currentUserId) return null;
    if (game.white.id === currentUserId) return "w" as const;
    if (game.black.id === currentUserId) return "b" as const;
    return null;
  }, [game, currentUserId]);

  const currentUserEmail = useMemo(() => {
    if (!game || !currentUserId) return null;
    if (game.white.id === currentUserId) return game.white.email;
    if (game.black.id === currentUserId) return game.black.email;
    return null;
  }, [game, currentUserId]);

  const isGameActive = status?.gameStatus === "ACTIVE";
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

  function pushToast(level: Toast["level"], message: string) {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((prev) => [...prev, { id, level, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
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
    const legalTargets = chess
      .moves({ square: selectedFrom as Square, verbose: true })
      .map((m) => m.to);

    if (!legalTargets.includes(square as Square)) {
      pushToast("warning", "That destination is not legal for the selected piece.");
      return;
    }

    const preview = buildMovePreview(status, selectedFrom, square, "q");
    if (!preview) {
      pushToast("error", "Illegal move.");
      setSelectedFrom(null);
      return;
    }

    const previousStatus = status;
    const previousGame = game;
    const previousLastMove = lastMoveSquare;

    setError(null);
    setSelectedFrom(null);
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
      const result = await callMcpTool<MovePieceData>("move_piece", {
        gameId,
        from: selectedFrom,
        to: square,
        promotion: "q"
      });
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
            <div className="game-head-player">
              <Avatar
                email={game.white.email}
                image={game.white.image}
                fallback="W"
                className="avatar-player"
                title={game.white.email ?? game.white.id}
              />
              <span className="muted">White</span>
            </div>
            <span className="game-head-vs">vs</span>
            <div className="game-head-player">
              <Avatar
                email={game.black.email}
                image={game.black.image}
                fallback="B"
                className="avatar-player"
                title={game.black.email ?? game.black.id}
              />
              <span className="muted">Black</span>
            </div>
          </div>
          <div className={`turn-banner game-status-pill ${statusClassName}`}>
            {statusMessage}
            {(isMovePending || isBoardSyncing) && (
              <span className="inline-loader">
                {isMovePending ? " Applying move..." : " Syncing..."}
              </span>
            )}
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
                interactive={isMyTurn && !isMovePending && !boardAnimation}
                orientation={myColor === "b" ? "black" : "white"}
              />
              {((isMovePending && !boardAnimation) || isBoardSyncing) && (
                <div className="board-overlay" aria-live="polite">
                  <span className="loader-dot" />
                  <span>{isMovePending ? "Applying move..." : "Syncing board..."}</span>
                </div>
              )}
            </div>
          </section>

          <aside className={`game-chat-pane ${mobilePane === "chat" ? "is-active" : ""}`}>
            {isChatLoading && <p className="muted">Loading chat...</p>}
            <ChatPanel
              messages={messages}
              currentUserId={currentUserId}
              canSend={Boolean(game.canMove && currentUserId)}
              onSend={sendMessage}
            />
          </aside>
        </div>
      </section>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
