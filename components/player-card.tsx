import { Avatar } from "@/components/avatar";

type PlayerLike = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type PlayerCardProps = {
  player: PlayerLike;
  className?: string;
  avatarClassName?: string;
  size?: "sm" | "md";
  align?: "left" | "right";
  pieceColor?: "white" | "black";
};

function getDisplayName(player: PlayerLike) {
  const name = player.name?.trim();
  if (name) return name;
  const email = player.email?.trim();
  if (email) return email.split("@")[0];
  return "Unknown player";
}

function getDisplayEmail(player: PlayerLike) {
  const email = player.email?.trim();
  if (email) return email;
  return "No email";
}

export function PlayerCard({
  player,
  className,
  avatarClassName,
  size = "md",
  align = "left",
  pieceColor
}: PlayerCardProps) {
  const displayName = getDisplayName(player);
  const displayEmail = getDisplayEmail(player);
  const fallback = (displayName[0] ?? "?").toUpperCase();
  const title = player.email ?? player.name ?? player.id ?? "Player";

  return (
    <div className={`player-card player-card-${size} player-card-${align} ${className ?? ""}`.trim()}>
      <span className="player-card-avatar-wrap">
        <Avatar
          email={player.email}
          name={player.name}
          image={player.image}
          fallback={fallback}
          className={`player-card-avatar ${avatarClassName ?? ""}`.trim()}
          title={title}
        />
        {pieceColor ? (
          <span
            className={`player-card-color-rook player-card-color-rook-${pieceColor}`}
            aria-label={`${pieceColor} player`}
            title={`${pieceColor[0].toUpperCase()}${pieceColor.slice(1)} player`}
          >
            ♜
          </span>
        ) : null}
      </span>
      <div className="player-card-meta">
        <p className="player-card-name">{displayName}</p>
        <p className="player-card-email">{displayEmail}</p>
      </div>
    </div>
  );
}
