export function getSnapshotVersion(updatedAt: Date) {
  return updatedAt.getTime().toString(36);
}

export function getSnapshotPath(gameId: string, version: string, size?: number) {
  const safeGameId = encodeURIComponent(gameId);
  const safeVersion = encodeURIComponent(version);
  const path = `/api/snapshots/${safeGameId}/${safeVersion}.svg`;
  if (!size) {
    return path;
  }
  return `${path}?size=${size}`;
}
