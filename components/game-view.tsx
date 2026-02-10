"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import * as Ably from "ably";

import { ChessBoard } from "@/components/chess-board";
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
    white: { id: string; email: string | null };
    black: { id: string; email: string | null };
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
    id: string;
    ply: number;
    san: string;
    from: string;
    to: string;
    createdAt: string;
    byUser: { id: string; email: string | null };
  }>;
};

type ChatData = {
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    user: { id: string; email: string | null };
  }>;
};

type MovePieceData = {
  move: {
    id: string;
    san: string;
    from: string;
    to: string;
    ply: number;
    createdAt: string;
  };
};

type Toast = {
  id: number;
  level: "warning" | "error";
  message: string;
};

type GameTab = "board" | "history" | "chat";

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

function getLastMoveDestination(moves: HistoryData["moves"]) {
  return moves.length ? moves[moves.length - 1].to : null;
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
  const [history, setHistory] = useState<HistoryData["moves"]>([]);
  const [messages, setMessages] = useState<ChatData["messages"]>([]);
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);
  const [lastMoveSquare, setLastMoveSquare] = useState<string | null>(null);
  const [recentMoveSquare, setRecentMoveSquare] = useState<string | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMovePending, setIsMovePending] = useState(false);
  const [isBoardSyncing, setIsBoardSyncing] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeTab, setActiveTab] = useState<GameTab>("board");
  const [unreadCount, setUnreadCount] = useState(0);
  const toastIdRef = useRef(0);
  const activeTabRef = useRef<GameTab>("board");
  const recentMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setIsHistoryLoading(true);
    setIsChatLoading(true);

    try {
      const [g, s, h, c] = await Promise.all([
        callMcpTool<GameData>("get_game", { gameId }),
        callMcpTool<StatusData>("status", { gameId }),
        callMcpTool<HistoryData>("history", { gameId }),
        callMcpTool<ChatData>("get_chat_messages", { gameId, limit: 80 })
      ]);

      setGame(g.game);
      setStatus(s);
      setHistory(h.moves);
      setLastMoveSquare(getLastMoveDestination(h.moves));
      setRecentMoveSquare(null);
      setMessages(c.messages);
      setUnreadCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load game");
    } finally {
      setLoading(false);
      setIsHistoryLoading(false);
      setIsChatLoading(false);
    }
  }, [gameId]);

  const refreshBoardState = useCallback(async () => {
    setIsBoardSyncing(true);
    setIsHistoryLoading(true);

    try {
      const [g, s, h] = await Promise.all([
        callMcpTool<GameData>("get_game", { gameId }),
        callMcpTool<StatusData>("status", { gameId }),
        callMcpTool<HistoryData>("history", { gameId })
      ]);

      setGame(g.game);
      setStatus(s);
      setHistory(h.moves);
      setLastMoveSquare(getLastMoveDestination(h.moves));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh game state");
    } finally {
      setIsBoardSyncing(false);
      setIsHistoryLoading(false);
    }
  }, [gameId]);

  const refreshChat = useCallback(
    async (showLoader = false) => {
      if (showLoader) {
        setIsChatLoading(true);
      }

      try {
        const chat = await callMcpTool<ChatData>("get_chat_messages", {
          gameId,
          limit: 80
        });
        setMessages(chat.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load chat");
      } finally {
        if (showLoader) {
          setIsChatLoading(false);
        }
      }
    },
    [gameId]
  );

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab === "chat") {
      setUnreadCount(0);
    }
  }, [activeTab]);

  useEffect(() => {
    const client = new Ably.Realtime({
      authUrl: "/api/ably/token",
      autoConnect: true,
      closeOnUnload: true
    });
    const channel = client.channels.get(`game:${gameId}`);

    const onMessage = (message: Ably.Message) => {
      if (message.name === "chat.created") {
        if (activeTabRef.current === "chat") {
          void refreshChat();
        } else {
          const byCurrentUser =
            typeof message.data === "object" &&
            message.data !== null &&
            "userId" in message.data &&
            message.data.userId === currentUserId;
          if (!byCurrentUser) {
            setUnreadCount((count) => count + 1);
          }
        }
        return;
      }

      if (
        message.name === "move.created" ||
        message.name === "game.finished" ||
        message.name === "game.created"
      ) {
        const moveTo =
          typeof message.data === "object" &&
          message.data !== null &&
          "to" in message.data &&
          typeof message.data.to === "string"
            ? message.data.to
            : null;
        markRecentMove(moveTo);
        void refreshBoardState();
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
  }, [gameId, currentUserId, markRecentMove, refreshBoardState, refreshChat]);

  useEffect(() => {
    return () => {
      if (recentMoveTimerRef.current) {
        clearTimeout(recentMoveTimerRef.current);
      }
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

  const gameResultMessage = useMemo(() => {
    if (!status || isGameActive) return null;

    if (status.isCheckmate) {
      const winner = status.turn === "w" ? game?.black : game?.white;
      return `Checkmate. Winner: ${winner?.email ?? winner?.id ?? "Unknown player"}.`;
    }

    if (status.isDraw || status.isStalemate) {
      return "Game over: Draw.";
    }

    return "Game finished.";
  }, [status, isGameActive, game]);

  useEffect(() => {
    if (!isMyTurn || activeTab !== "board") {
      setSelectedFrom(null);
    }
  }, [isMyTurn, activeTab]);

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

    const optimistic = new Chess(status.fen);
    const optimisticMove = optimistic.move({
      from: selectedFrom,
      to: square,
      promotion: "q"
    });
    if (!optimisticMove) {
      pushToast("error", "Illegal move.");
      setSelectedFrom(null);
      return;
    }

    const previousStatus = status;
    const previousHistory = history;
    const previousGame = game;
    const previousLastMove = lastMoveSquare;
    const optimisticFen = optimistic.fen();
    const optimisticStatus: StatusData = {
      ...status,
      fen: optimisticFen,
      turn: optimistic.turn(),
      isCheck: optimistic.isCheck(),
      isCheckmate: optimistic.isCheckmate(),
      isStalemate: optimistic.isStalemate(),
      isDraw: optimistic.isDraw(),
      gameStatus: optimistic.isGameOver() ? "FINISHED" : "ACTIVE",
      pieces: getPiecesFromFen(optimisticFen)
    };
    const optimisticHistoryMove: HistoryData["moves"][number] = {
      id: `optimistic-${Date.now()}`,
      ply: (history[history.length - 1]?.ply ?? 0) + 1,
      san: optimisticMove.san,
      from: selectedFrom,
      to: square,
      createdAt: new Date().toISOString(),
      byUser: { id: currentUserId ?? "unknown", email: currentUserEmail ?? null }
    };

    setError(null);
    setSelectedFrom(null);
    markRecentMove(square);
    setStatus(optimisticStatus);
    setHistory((prev) => [...prev, optimisticHistoryMove]);
    setGame((prev) =>
      prev
        ? {
            ...prev,
            moveCount: prev.moveCount + 1,
            status: optimisticStatus.gameStatus
          }
        : prev
    );
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
      setHistory(previousHistory);
      setGame(previousGame);
      setLastMoveSquare(previousLastMove);
      setRecentMoveSquare(null);
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

  async function loadSnapshot() {
    setError(null);
    setIsSnapshotLoading(true);
    try {
      const snap = await callMcpTool<{
        snapshotUrl?: string;
        snapshotPath?: string;
      }>("snapshot", { gameId, size: 560 });
      if (snap.snapshotUrl) {
        setSnapshotUrl(snap.snapshotUrl);
        return;
      }
      if (snap.snapshotPath) {
        setSnapshotUrl(snap.snapshotPath);
        return;
      }
      throw new Error("Snapshot URL missing from payload");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Snapshot failed");
    } finally {
      setIsSnapshotLoading(false);
    }
  }

  if (loading) {
    return <p className="muted">Loading game...</p>;
  }

  if (!game || !status) {
    return <p className="error">Game unavailable.</p>;
  }

  return (
    <div className="stack" style={{ marginTop: "1rem" }}>
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

      <Link href="/" className="crumb-link">
        ← Back to games
      </Link>

      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>
            {game.white.email ?? game.white.id} vs {game.black.email ?? game.black.id}
          </h2>
          <strong>{status.gameStatus}</strong>
        </div>

        <p className="muted">
          Turn: {status.turn === "w" ? "White" : "Black"} • Moves: {game.moveCount}
          {(isMovePending || isBoardSyncing) && (
            <span className="inline-loader">{isMovePending ? "Applying move..." : " Syncing..."}</span>
          )}
        </p>

        {gameResultMessage && <div className="game-result-banner">{gameResultMessage}</div>}

        <div className="tabs">
          <button
            className={`tab ${activeTab === "board" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("board")}
          >
            Board
          </button>
          <button
            className={`tab ${activeTab === "history" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("history")}
          >
            Move History
            {isHistoryLoading && <span className="tab-badge tab-badge-loading">...</span>}
          </button>
          <button
            className={`tab ${activeTab === "chat" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("chat")}
          >
            Chat
            {isChatLoading ? (
              <span className="tab-badge tab-badge-loading">...</span>
            ) : (
              unreadCount > 0 && <span className="tab-badge">{unreadCount}</span>
            )}
          </button>
        </div>

        {activeTab === "board" && (
          <>
            {canPlay ? (
              isMyTurn ? (
                <div className="turn-banner my-turn">Your turn to move</div>
              ) : (
                <div className="turn-banner waiting-turn">
                  Not your turn. Waiting for opponent.
                </div>
              )
            ) : (
              <div className="turn-banner spectator-turn">
                You can view this game, but only the two players can move.
              </div>
            )}

            <div className="row">
              {status.isCheck && <span>Check</span>}
              {status.isCheckmate && <span>Checkmate</span>}
              {status.isStalemate && <span>Stalemate</span>}
              {status.isDraw && <span>Draw</span>}
            </div>

            <div className="board-wrap">
              <ChessBoard
                pieces={status.pieces}
                selectedSquare={selectedFrom}
                lastMoveSquare={lastMoveSquare}
                recentMoveSquare={recentMoveSquare}
                onSquareClick={(sq) => void handleSquareClick(sq)}
                interactive={isMyTurn && !isMovePending}
                orientation={myColor === "b" ? "black" : "white"}
              />
              {(isMovePending || isBoardSyncing) && (
                <div className="board-overlay" aria-live="polite">
                  <span className="loader-dot" />
                  <span>{isMovePending ? "Applying move..." : "Syncing board..."}</span>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "history" && (
          <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>History</h3>
              <button
                type="button"
                className="primary"
                onClick={() => void loadSnapshot()}
                disabled={isSnapshotLoading}
              >
                {isSnapshotLoading ? "Loading..." : "Snapshot"}
              </button>
            </div>

            {isHistoryLoading && <p className="muted">Loading history...</p>}

            {history.length === 0 ? (
              <p className="muted">No moves yet.</p>
            ) : (
              <ul className="game-list">
                {history.map((m) => (
                  <li key={m.id}>
                    <strong>
                      {m.ply}. {m.san}
                    </strong>
                    <p className="muted">
                      {m.byUser.email ?? m.byUser.id} • {new Date(m.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {snapshotUrl && (
              <img src={snapshotUrl} alt="Chess board snapshot" className="snapshot" />
            )}
          </>
        )}

        {activeTab === "chat" && (
          <>
            {isChatLoading && <p className="muted">Loading chat...</p>}
            <ChatPanel
              messages={messages}
              canSend={Boolean(game.canMove && currentUserId)}
              onSend={sendMessage}
            />
          </>
        )}
      </section>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
