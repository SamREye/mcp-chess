 "use client";

import { Chess } from "chess.js";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { formatHumanRelativeDate } from "@/lib/date-time";
import { PlayerCard } from "@/components/player-card";

type GameCardPlayer = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type GameCardProps = {
  game: {
    id: string;
    white: GameCardPlayer;
    black: GameCardPlayer;
    status: string;
    fen: string;
    moveCount: number;
    updatedAt: string;
  };
  canArchive?: boolean;
  onArchive?: (gameId: string) => void | Promise<void>;
  outcomeForCurrentUser?: "win" | "loss" | null;
};

function getStatusTone(status: string) {
  const normalized = status.trim().toUpperCase();
  if (normalized === "ACTIVE") return "active";
  if (normalized === "FINISHED") return "finished";
  return "default";
}

type GameConclusion =
  | {
      kind: "checkmate";
      winner: GameCardPlayer;
      winnerColor: "white" | "black";
    }
  | {
      kind: "stalemate" | "draw" | "finished";
    };

function getGameConclusion(game: GameCardProps["game"]): GameConclusion | null {
  if (game.status.trim().toUpperCase() !== "FINISHED") {
    return null;
  }

  try {
    const chess = new Chess(game.fen);

    if (chess.isCheckmate()) {
      const winnerColor = chess.turn() === "w" ? "black" : "white";
      return {
        kind: "checkmate",
        winner: winnerColor === "white" ? game.white : game.black,
        winnerColor
      };
    }

    if (chess.isStalemate()) {
      return { kind: "stalemate" };
    }

    if (chess.isDraw()) {
      return { kind: "draw" };
    }

    return { kind: "finished" };
  } catch {
    return { kind: "finished" };
  }
}

function renderConclusion(conclusion: GameConclusion) {
  if (conclusion.kind === "checkmate") {
    return (
      <span className="game-card-conclusion game-card-conclusion-winner">
        <span className="game-card-conclusion-winner-wrap">
          <Avatar
            email={null}
            name={null}
            image={conclusion.winner.image}
            fallback="?"
            title="Winner"
            className="game-card-conclusion-winner-avatar"
          />
          <span
            className={`game-card-conclusion-rook game-card-conclusion-rook-${conclusion.winnerColor}`}
            aria-hidden="true"
          >
            ♚
          </span>
        </span>
        <span className="game-card-conclusion-label">Winner</span>
      </span>
    );
  }

  if (conclusion.kind === "stalemate") return <span className="game-card-conclusion">Stalemate</span>;
  if (conclusion.kind === "draw") return <span className="game-card-conclusion">Draw</span>;

  return <span className="game-card-conclusion">Game concluded</span>;
}

function renderOutcomeLabel(outcome: "win" | "loss") {
  return (
    <span className={`game-card-conclusion game-card-conclusion-${outcome}`}>
      <span className="game-card-conclusion-label">{outcome === "win" ? "Win" : "Loss"}</span>
    </span>
  );
}

export function GameCard({ game, canArchive = false, onArchive, outcomeForCurrentUser }: GameCardProps) {
  const statusTone = getStatusTone(game.status);
  const lastMoveLabel = formatHumanRelativeDate(game.updatedAt);
  const conclusion = getGameConclusion(game);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      setIsMenuOpen(false);
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [isMenuOpen]);

  const handleMenuToggle = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsMenuOpen((open) => !open);
    },
    []
  );

  const handleArchive = useCallback(
    async (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!onArchive || isArchiving) return;
      if (!window.confirm("Archive this game?")) {
        setIsMenuOpen(false);
        return;
      }
      setIsMenuOpen(false);
      setIsArchiving(true);
      try {
        await onArchive(game.id);
      } finally {
        setIsArchiving(false);
      }
    },
    [game.id, isArchiving, onArchive]
  );

  const showMenu = canArchive && Boolean(onArchive);

  return (
    <Link href={`/games/${game.id}`} className="game-card">
      {showMenu && (
        <div className="game-card-overflow game-actions-menu" ref={menuRef}>
          <button
            type="button"
            className="overflow-btn"
            onClick={handleMenuToggle}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            title="Game actions"
          >
            ⋯
          </button>
          {isMenuOpen && (
            <div className="overflow-menu" role="menu">
              <button
                type="button"
                className="overflow-menu-item overflow-menu-item-danger"
                role="menuitem"
                onClick={handleArchive}
                disabled={isArchiving}
              >
                Archive
              </button>
            </div>
          )}
        </div>
      )}
      <div className="game-card-top">
        <div className="game-card-players">
          <PlayerCard
            player={game.white}
            size="sm"
            className="game-card-player"
            avatarClassName="pvp-avatar"
            pieceColor="white"
            showMeta={false}
          />
          <span className="game-card-vs">vs</span>
          <PlayerCard
            player={game.black}
            size="sm"
            className="game-card-player"
            avatarClassName="pvp-avatar"
            pieceColor="black"
            showMeta={false}
          />
        </div>
        {outcomeForCurrentUser ? (
          <div className="game-card-conclusion-slot">{renderOutcomeLabel(outcomeForCurrentUser)}</div>
        ) : conclusion ? (
          <div className="game-card-conclusion-slot">{renderConclusion(conclusion)}</div>
        ) : (
          <span className="game-card-conclusion-slot game-card-conclusion-slot-empty" aria-hidden="true" />
        )}
        <div className="game-card-state">
          <div className="game-card-status-wrap">
            <div className="game-card-status-top">
              <span className={`game-card-status game-card-status-${statusTone}`}>{game.status}</span>
            </div>
            <span className="game-card-timestamp">
              {lastMoveLabel}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
