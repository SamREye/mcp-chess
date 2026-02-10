import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { db } from "@/lib/db";

const providers = [];
const allowEmailAccountLinking = process.env.GOOGLE_ALLOW_EMAIL_ACCOUNT_LINKING === "true";

if (process.env.GOOGLE_ID && process.env.GOOGLE_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: allowEmailAccountLinking,
      authorization: {
        params: {
          prompt: "select_account"
        }
      }
    })
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: {
    strategy: "database"
  },
  providers,
  callbacks: {
    session: ({ session, user }) => {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    }
  }
};

export function auth() {
  return getServerSession(authOptions);
}
