import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth";
import { ensureDbReady } from "@/lib/db";

export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);

export async function GET(req: Request, ctx: unknown) {
  await ensureDbReady();
  return (handler as any)(req, ctx);
}

export async function POST(req: Request, ctx: unknown) {
  await ensureDbReady();
  return (handler as any)(req, ctx);
}
