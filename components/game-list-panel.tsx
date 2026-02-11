"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GameCard } from "@/components/game-card";
import { PlayerCard } from "@/components/player-card";
import { callMcpTool } from "@/lib/mcp-client";

type GameSummary = {
  id: string;
  white: { id: string; name: string | null; email: string | null; image: string | null };
  black: { id: string; name: string | null; email: string | null; image: string | null };
  status: string;
  moveCount: number;
  updatedAt: string;
};

type UserItem = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type InvitationResult = {
  sent: boolean;
  skippedReason?: string;
  error?: string;
};

type GameTab = "my" | "others";
type GamesByTab = Record<GameTab, GameSummary[]>;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyGamesByTab: GamesByTab = {
  my: [],
  others: []
};

type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export function GameListPanel({ currentUser }: { currentUser: CurrentUser | null }) {
  const currentUserId = currentUser?.id ?? null;
  const router = useRouter();
  const queryCacheRef = useRef<Map<string, UserItem[]>>(new Map());
  const [tab, setTab] = useState<GameTab>(currentUserId ? "my" : "others");
  const [gamesByTab, setGamesByTab] = useState<GamesByTab>(emptyGamesByTab);
  const [loadingGames, setLoadingGames] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);

  const [isNewGameOpen, setIsNewGameOpen] = useState(false);
  const [opponentInput, setOpponentInput] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [playAs, setPlayAs] = useState<"white" | "black">("white");
  const [inviteInfo, setInviteInfo] = useState<string | null>(null);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [newGameError, setNewGameError] = useState<string | null>(null);

  const loadGames = useCallback(async () => {
    setLoadingGames(true);
    setGamesError(null);

    try {
      if (currentUserId) {
        const [myGames, otherGames] = await Promise.all([
          callMcpTool<{ games: GameSummary[] }>("list_games", {
            scope: "my",
            limit: 40
          }),
          callMcpTool<{ games: GameSummary[] }>("list_games", {
            scope: "others",
            limit: 40
          })
        ]);

        setGamesByTab({
          my: myGames.games,
          others: otherGames.games
        });
        return;
      }

      const otherGames = await callMcpTool<{ games: GameSummary[] }>("list_games", {
        scope: "others",
        limit: 40
      });
      setGamesByTab({
        my: [],
        others: otherGames.games
      });
    } catch (err) {
      setGamesError(err instanceof Error ? err.message : "Failed to load games");
      setGamesByTab(emptyGamesByTab);
    } finally {
      setLoadingGames(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId && tab === "my") {
      setTab("others");
    }
  }, [currentUserId, tab]);

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  useEffect(() => {
    if (!isNewGameOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNewGameOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isNewGameOpen]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const query = opponentInput.trim();
      if (!query || query.length < 2 || !currentUserId || !isNewGameOpen) {
        setUsers([]);
        return;
      }

      const cacheKey = query.toLowerCase();
      const cached = queryCacheRef.current.get(cacheKey);
      if (cached) {
        setUsers(cached.filter((u) => u.id !== currentUserId));
        return;
      }

      try {
        const result = await callMcpTool<{ users: UserItem[] }>("query_users_by_email", {
          query,
          limit: 10
        });

        if (!cancelled) {
          queryCacheRef.current.set(cacheKey, result.users);
          while (queryCacheRef.current.size > 50) {
            const oldestKey = queryCacheRef.current.keys().next().value;
            if (!oldestKey) break;
            queryCacheRef.current.delete(oldestKey);
          }
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
  }, [opponentInput, currentUserId, isNewGameOpen]);

  const games = tab === "my" ? gamesByTab.my : gamesByTab.others;
  const normalizedInput = opponentInput.trim().toLowerCase();

  const matchedByEmail = useMemo(
    () => users.find((u) => u.email?.toLowerCase() === normalizedInput),
    [users, normalizedInput]
  );

  const chosenUser = matchedByEmail ?? selectedUser;
  const opponentEmail =
    chosenUser?.email?.toLowerCase() ?? (emailRegex.test(normalizedInput) ? normalizedInput : null);
  const isUnregisteredInvite = Boolean(opponentEmail && !chosenUser);
  const opponentPreview = chosenUser
    ? chosenUser
    : opponentEmail
      ? {
          id: "typed-opponent",
          name: opponentEmail.split("@")[0] ?? "?",
          email: opponentEmail,
          image: null
        }
      : {
          id: "pending-opponent",
          name: "?",
          email: "Choose opponent",
          image: null
        };
  const selfPreview = currentUser ?? {
    id: "me",
    name: "Me",
    email: null,
    image: null
  };
  const whitePreview = playAs === "white" ? selfPreview : opponentPreview;
  const blackPreview = playAs === "black" ? selfPreview : opponentPreview;

  async function createGame() {
    if (!opponentEmail || isCreatingGame || !currentUserId) return;

    setNewGameError(null);
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

      setIsNewGameOpen(false);
      router.push(`/games/${result.game.id}`);
    } catch (err) {
      setNewGameError(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setIsCreatingGame(false);
    }
  }

  function selectSuggestion(user: UserItem) {
    if (!user.email) return;
    setSelectedUser(user);
    setOpponentInput(user.email);
  }

  function openNewGameModal() {
    if (!currentUserId) return;
    setNewGameError(null);
    setInviteInfo(null);
    setOpponentInput("");
    setSelectedUser(null);
    setUsers([]);
    setPlayAs("white");
    setIsNewGameOpen(true);
  }

  return (
    <>
      <section className="panel stack game-list-main">
        <div className="row game-list-head">
          <h2 style={{ margin: 0 }}>Game List</h2>
          <div className="row">
            <div className="tabs">
              <button
                className={`tab ${tab === "my" ? "active" : ""}`}
                onClick={() => setTab("my")}
                type="button"
                disabled={!currentUserId}
              >
                My Games
              </button>
              <button
                className={`tab ${tab === "others" ? "active" : ""}`}
                onClick={() => setTab("others")}
                type="button"
              >
                Others&apos; Games
              </button>
            </div>
            <button
              type="button"
              className="primary new-game-open-btn"
              onClick={openNewGameModal}
              disabled={!currentUserId}
              title={currentUserId ? "Create a new game" : "Sign in to create games"}
            >
              New Game
            </button>
          </div>
        </div>

        {!currentUserId && (
          <p className="muted">Sign in to create games and view your own game list.</p>
        )}

        {loadingGames ? (
          <p className="muted">Loading games...</p>
        ) : games.length === 0 ? (
          <p className="muted">No games in this tab yet.</p>
        ) : (
          <ul className="game-list">
            {games.map((game) => (
              <li key={game.id}>
                <GameCard game={game} />
              </li>
            ))}
          </ul>
        )}

        {gamesError && <p className="error">{gamesError}</p>}
      </section>

      {currentUserId && (
        <button
          type="button"
          className="primary new-game-fab"
          onClick={openNewGameModal}
          aria-label="New game"
          title="New game"
        >
          <span className="new-game-fab-plus" aria-hidden="true">
            +
          </span>
          <span className="new-game-fab-label">New Game</span>
        </button>
      )}

      {isNewGameOpen && (
        <div className="modal-backdrop" onClick={() => setIsNewGameOpen(false)}>
          <div className="panel new-game-modal" onClick={(event) => event.stopPropagation()}>
            <div className="row new-game-head">
              <h2 style={{ margin: 0 }}>New Game</h2>
              <button type="button" className="new-game-close" onClick={() => setIsNewGameOpen(false)}>
                Close
              </button>
            </div>

            <div className="new-game-fields">
              <label className="new-game-field">
                <span>Opponent email (or name)</span>
                <input
                  value={opponentInput}
                  onChange={(event) => {
                    setSelectedUser(null);
                    setOpponentInput(event.target.value);
                  }}
                  placeholder="Search by name/email or enter email"
                />
              </label>

              <div className="new-game-suggestions">
                <ul className="game-list">
                  {users.map((user) => (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => selectSuggestion(user)}
                        className="user-pick"
                      >
                        <PlayerCard player={user} size="sm" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {isUnregisteredInvite && (
                <p className="muted">
                  This email is not registered yet. You can still create the game and send an
                  invitation.
                </p>
              )}
            </div>

            <div className="new-game-matchup">
              <div className="new-game-side">
                <p className="new-game-side-label">White</p>
                <PlayerCard player={whitePreview} className="new-game-preview-player" />
              </div>
              <span className="new-game-vs">vs</span>
              <div className="new-game-side">
                <p className="new-game-side-label">Black</p>
                <PlayerCard player={blackPreview} className="new-game-preview-player" />
              </div>
            </div>

            <div className="new-game-actions">
              <label className="new-game-field-inline">
                <span>You play as</span>
                <select
                  value={playAs}
                  onChange={(event) => setPlayAs(event.target.value as "white" | "black")}
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
            </div>

            {inviteInfo && <p className="muted">{inviteInfo}</p>}
            {newGameError && <p className="error">{newGameError}</p>}
          </div>
        </div>
      )}
    </>
  );
}
