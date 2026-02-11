"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PlayerCard } from "@/components/player-card";

type TopbarProps = {
  user: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  } | null;
};

export function Topbar({ user }: TopbarProps) {
  const pathname = usePathname();
  const showBack = pathname !== "/";

  return (
    <header className="topbar">
      <div className="topbar-left">
        {showBack ? (
          <Link href="/" className="topbar-back">
            ← Back
          </Link>
        ) : (
          <span className="topbar-spacer" aria-hidden="true" />
        )}
      </div>
      <div className="brand brand-center">
        <h1>MCP Chess</h1>
      </div>
      <nav className="topnav topbar-right">
        {user ? (
          <>
            <PlayerCard player={user} size="sm" className="topbar-player" />
            <form action="/api/auth/signout" method="post">
              <button type="submit">Sign out</button>
            </form>
          </>
        ) : (
          <a href="/api/auth/signin/google?prompt=select_account&callbackUrl=%2F">Sign in</a>
        )}
      </nav>
    </header>
  );
}
