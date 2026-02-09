import { auth } from "@/lib/auth";
import { GameView } from "@/components/game-view";

export default async function GamePage({
  params
}: {
  params: { id: string };
}) {
  const session = await auth();

  return <GameView gameId={params.id} currentUserId={session?.user?.id ?? null} />;
}
