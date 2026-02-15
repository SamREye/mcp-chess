import { Chess } from "chess.js";

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

export function GameCard({ game }: GameCardProps) {
  const statusTone = getStatusTone(game.status);
  const lastMoveLabel = formatHumanRelativeDate(game.updatedAt);
  const conclusion = getGameConclusion(game);

  return (
    <Link href={`/games/${game.id}`} className="game-card">
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
        {conclusion ? (
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
