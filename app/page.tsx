import { auth } from "@/lib/auth";
import { GameListPanel } from "@/components/game-list-panel";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="stack">
      <GameListPanel currentUserId={session?.user?.id ?? null} />
    </div>
  );
}
