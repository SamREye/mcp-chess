import type { Metadata } from "next";

import "@/app/globals.css";
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

  return (
    <html lang="en">
      <body>
        <div className="page-shell">
          <header className="topbar">
            <div className="brand">
              <h1>MCP Chess</h1>
            </div>
            <nav className="topnav">
              {session?.user ? (
                <>
                  <span className="muted">
                    {session.user.name
                      ? `${session.user.name} (${session.user.email ?? "no-email"})`
                      : (session.user.email ?? "Signed in")}
                  </span>
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
