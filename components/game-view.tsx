"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import * as Ably from "ably";

import { callMcpTool } from "@/lib/mcp-client";
import { ChessBoard } from "@/components/chess-board";
import { ChatPanel } from "@/components/chat-panel";

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

type Toast = {
  id: number;
  level: "warning" | "error";
  message: string;
};

type GameTab = "board" | "history" | "chat";

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
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeTab, setActiveTab] = useState<GameTab>("board");
  const [unreadCount, setUnreadCount] = useState(0);
  const toastIdRef = useRef(0);
  const activeTabRef = useRef<GameTab>("board");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

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
      setMessages(c.messages);
      setUnreadCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load game");
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab === "chat") {
      setUnreadCount(0);
    }
  }, [activeTab]);

  const refreshChat = useCallback(async () => {
    const chat = await callMcpTool<ChatData>("get_chat_messages", {
      gameId,
      limit: 80
    });
    setMessages(chat.messages);
  }, [gameId]);

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
        void load();
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
  }, [gameId, currentUserId, load, refreshChat]);

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
    if (!status || !game?.canMove || !myColor) return;
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

    setError(null);
    try {
      await callMcpTool("move_piece", {
        gameId,
        from: selectedFrom,
        to: square,
        promotion: "q"
      });
      setSelectedFrom(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Move failed";
      setError(message);
      if (message.includes("Illegal move")) {
        pushToast(
          "error",
          "Illegal move. This move would break chess rules (for example, exposing your king)."
        );
      } else if (message.includes("not your turn")) {
        pushToast("warning", "Not your turn.");
      }
      setSelectedFrom(null);
    }
  }

  async function sendMessage(body: string) {
    await callMcpTool("post_chat_message", {
      gameId,
      body
    });

    const chat = await callMcpTool<ChatData>("get_chat_messages", {
      gameId,
      limit: 80
    });
    setMessages(chat.messages);
    setUnreadCount(0);
  }

  async function loadSnapshot() {
    setError(null);
    try {
      const snap = await callMcpTool<{ dataUrl: string }>("snapshot", { gameId, size: 560 });
      setSnapshotUrl(snap.dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Snapshot failed");
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

      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>
            {game.white.email ?? game.white.id} vs {game.black.email ?? game.black.id}
          </h2>
          <strong>{status.gameStatus}</strong>
        </div>

        <p className="muted">
          Turn: {status.turn === "w" ? "White" : "Black"} • Moves: {game.moveCount}
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
          </button>
          <button
            className={`tab ${activeTab === "chat" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("chat")}
          >
            Chat
            {unreadCount > 0 && <span className="tab-badge">{unreadCount}</span>}
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

            <ChessBoard
              pieces={status.pieces}
              selectedSquare={selectedFrom}
              onSquareClick={(sq) => void handleSquareClick(sq)}
              interactive={isMyTurn}
              orientation={myColor === "b" ? "black" : "white"}
            />

            <p className="muted">
              {isMyTurn
                ? "Select one of your pieces, then a destination square."
                : "Board is locked until your turn."}
            </p>
          </>
        )}

        {activeTab === "history" && (
          <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>History</h3>
              <button type="button" className="primary" onClick={() => void loadSnapshot()}>
                Snapshot
              </button>
            </div>

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
          <ChatPanel
            messages={messages}
            canSend={Boolean(game.canMove && currentUserId)}
            onSend={sendMessage}
          />
        )}
      </section>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
