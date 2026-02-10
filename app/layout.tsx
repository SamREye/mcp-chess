import type { Metadata } from "next";
import Link from "next/link";

import "@/app/globals.css";
import { Avatar } from "@/components/avatar";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "MCP Chess",
  description: "Public chess games with MCP actions"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const identityTitle = session?.user?.email ?? session?.user?.name ?? "Signed in";

  return (
    <html lang="en">
      <body>
        <div className="page-shell">
          <header className="topbar">
            <div className="topbar-left">
              <Link href="/" className="topbar-back">
                ← Back
              </Link>
            </div>
            <div className="brand brand-center">
              <h1>MCP Chess</h1>
            </div>
            <nav className="topnav topbar-right">
              {session?.user ? (
                <>
                  <Avatar
                    email={session.user.email}
                    name={session.user.name}
                    image={session.user.image}
                    fallback="?"
                    className="avatar-self"
                    title={identityTitle}
                  />
                  <form action="/api/auth/signout" method="post">
                    <button type="submit">Sign out</button>
                  </form>
                </>
              ) : (
                <a href="/api/auth/signin/google?prompt=select_account&callbackUrl=%2F">
                  Sign in
                </a>
              )}
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
