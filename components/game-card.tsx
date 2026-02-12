import Link from "next/link";

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

export function GameCard({ game }: GameCardProps) {
  const statusTone = getStatusTone(game.status);
  const lastMoveLabel = formatHumanRelativeDate(game.updatedAt);

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
        <div className="game-card-state">
          <div className="game-card-status-wrap">
            <div className="game-card-status-row">
              <span className="game-card-moves">{game.moveCount} moves</span>
              <span className={`game-card-status game-card-status-${statusTone}`}>{game.status}</span>
            </div>
            <span className="game-card-timestamp">
              Last move: {lastMoveLabel}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
