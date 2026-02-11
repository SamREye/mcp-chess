import { auth } from "@/lib/auth";
import { GameListPanel } from "@/components/game-list-panel";

export default async function HomePage() {
  const session = await auth();

  return (
    <GameListPanel
      currentUser={
        session?.user
          ? {
              id: session.user.id,
              name: session.user.name ?? null,
              email: session.user.email ?? null,
              image: session.user.image ?? null
            }
          : null
      }
    />
  );
}
