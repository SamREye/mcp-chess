"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { callMcpTool } from "@/lib/mcp-client";

type GameSummary = {
  id: string;
  white: { id: string; email: string | null };
  black: { id: string; email: string | null };
  status: string;
  moveCount: number;
  updatedAt: string;
};

type UserItem = {
  id: string;
  name: string | null;
  email: string | null;
};

type InvitationResult = {
  sent: boolean;
  skippedReason?: string;
  error?: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function GameListPanel({ currentUserId }: { currentUserId: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<"my" | "others">(currentUserId ? "my" : "others");
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [opponentInput, setOpponentInput] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [playAs, setPlayAs] = useState<"white" | "black">("white");
  const [inviteInfo, setInviteInfo] = useState<string | null>(null);
  const [isCreatingGame, setIsCreatingGame] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadGames() {
      setLoading(true);
      setError(null);
      try {
        const scope = tab === "my" ? "my" : "others";
        const data = await callMcpTool<{ games: GameSummary[] }>("list_games", {
          scope,
          limit: 40
        });

        if (!cancelled) {
          setGames(data.games);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load games");
          setGames([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (!currentUserId && tab === "my") {
      setGames([]);
      setLoading(false);
      return;
    }

    void loadGames();

    return () => {
      cancelled = true;
    };
  }, [tab, currentUserId]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const query = opponentInput.trim();
      if (!query) {
        setUsers([]);
        return;
      }

      try {
        const result = await callMcpTool<{ users: UserItem[] }>("query_users_by_email", {
          query,
          limit: 10
        });

        if (!cancelled) {
          setUsers(result.users.filter((u) => u.id !== currentUserId));
        }
      } catch {
        if (!cancelled) {
          setUsers([]);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [opponentInput, currentUserId]);

  const normalizedInput = opponentInput.trim().toLowerCase();

  const matchedByEmail = useMemo(
    () => users.find((u) => u.email?.toLowerCase() === normalizedInput),
    [users, normalizedInput]
  );

  const chosenUser = matchedByEmail ?? selectedUser;
  const opponentEmail = chosenUser?.email?.toLowerCase() ??
    (emailRegex.test(normalizedInput) ? normalizedInput : null);
  const isUnregisteredInvite = Boolean(opponentEmail && !chosenUser);

  async function createGame() {
    if (!opponentEmail || isCreatingGame) return;

    setError(null);
    setInviteInfo(null);
    setIsCreatingGame(true);

    try {
      const result = await callMcpTool<{ game: { id: string }; invitation: InvitationResult }>(
        "new_game",
        {
          opponentEmail,
          playAs
        }
      );

      if (result.invitation.sent) {
        setInviteInfo("Invitation email sent.");
      } else if (result.invitation.skippedReason) {
        setInviteInfo(`Invitation not sent: ${result.invitation.skippedReason}`);
      } else if (result.invitation.error) {
        setInviteInfo(`Invitation failed: ${result.invitation.error}`);
      }

      router.push(`/games/${result.game.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setIsCreatingGame(false);
    }
  }

  function selectSuggestion(user: UserItem) {
    if (!user.email) return;
    setSelectedUser(user);
    setOpponentInput(user.email);
  }

  return (
    <section className="grid-2">
      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Game List</h2>
          <div className="tabs">
            <button
              className={`tab ${tab === "my" ? "active" : ""}`}
              onClick={() => setTab("my")}
              type="button"
            >
              My Games
            </button>
            <button
              className={`tab ${tab === "others" ? "active" : ""}`}
              onClick={() => setTab("others")}
              type="button"
            >
              Others' Games
            </button>
          </div>
        </div>

        {!currentUserId && tab === "my" ? (
          <p className="muted">Sign in to view your games.</p>
        ) : loading ? (
          <p className="muted">Loading games...</p>
        ) : games.length === 0 ? (
          <p className="muted">No games in this tab yet.</p>
        ) : (
          <ul className="game-list">
            {games.map((game) => (
              <li key={game.id}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>
                    {game.white.email ?? game.white.id} vs {game.black.email ?? game.black.id}
                  </strong>
                  <span>{game.status}</span>
                </div>
                <p className="muted">
                  {game.moveCount} moves • updated {new Date(game.updatedAt).toLocaleString()}
                </p>
                <Link href={`/games/${game.id}`}>Open game</Link>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="error">{error}</p>}
      </div>

      <div className="panel stack">
        <h2 style={{ margin: 0 }}>New Game</h2>

        {!currentUserId ? (
          <p className="muted">Sign in to create games and move pieces.</p>
        ) : (
          <>
            <label>
              Opponent email (or name)
              <input
                value={opponentInput}
                onChange={(e) => {
                  setSelectedUser(null);
                  setOpponentInput(e.target.value);
                }}
                placeholder="Search by name/email or enter email"
              />
            </label>

            {users.length > 0 && (
              <ul className="game-list">
                {users.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => selectSuggestion(u)}
                      style={{ all: "unset", cursor: "pointer" }}
                    >
                      <strong>{u.email ?? u.id}</strong>
                      <p className="muted">{u.name ?? "No name set"}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {isUnregisteredInvite && (
              <p className="muted">
                This email is not registered yet. You can still create the game and send an
                invitation.
              </p>
            )}

            <label>
              You play as
              <select
                value={playAs}
                onChange={(e) => setPlayAs(e.target.value as "white" | "black")}
              >
                <option value="white">White</option>
                <option value="black">Black</option>
              </select>
            </label>

            <button
              type="button"
              className="primary"
              disabled={!opponentEmail || isCreatingGame}
              onClick={() => void createGame()}
            >
              {isCreatingGame ? "Creating game..." : "Create game"}
            </button>

            {inviteInfo && <p className="muted">{inviteInfo}</p>}
          </>
        )}
      </div>
    </section>
  );
}
