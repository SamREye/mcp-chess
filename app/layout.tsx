import type { Metadata } from "next";

import "@/app/globals.css";
import { SiteFooter } from "@/components/site-footer";
import { Topbar } from "@/components/topbar";
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
          <Topbar user={session?.user ?? null} />
          <main className="page-main">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
