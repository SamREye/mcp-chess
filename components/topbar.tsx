"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { HeaderHelp } from "@/components/header-help";
import { PlayerCard } from "@/components/player-card";
import logoImage from "@/app/mcp-chess-logo.jpg";

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
  const [isSignoutOpen, setIsSignoutOpen] = useState(false);

  useEffect(() => {
    if (!isSignoutOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSignoutOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSignoutOpen]);

  return (
    <>
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
          <Image
            src={logoImage}
            alt="MCP Chess logo"
            width={30}
            height={30}
            className="brand-logo"
            priority
          />
          <h1>MCP Chess</h1>
        </div>
        <nav className="topnav topbar-right">
          {user ? (
            <button
              type="button"
              className="topbar-player-trigger"
              onClick={() => setIsSignoutOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={isSignoutOpen}
            >
              <PlayerCard player={user} size="sm" className="topbar-player" />
            </button>
          ) : (
            <a href="/api/auth/signin/google?prompt=select_account&callbackUrl=%2F">Sign in</a>
          )}
          <HeaderHelp />
        </nav>
      </header>

      {user && isSignoutOpen && (
        <div className="modal-backdrop" onClick={() => setIsSignoutOpen(false)}>
          <div
            className="panel topbar-signout-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="topbar-signout-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="topbar-signout-title" style={{ margin: 0 }}>
              Sign out?
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              You will need to sign in again to play or chat.
            </p>
            <div className="topbar-signout-actions">
              <button type="button" className="promotion-cancel" onClick={() => setIsSignoutOpen(false)}>
                Cancel
              </button>
              <form action="/api/auth/signout" method="post">
                <button type="submit" className="primary">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
