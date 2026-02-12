export function getSnapshotVersion(updatedAt: Date) {
  return updatedAt.getTime().toString(36);
}

export type SnapshotFormat = "png" | "jpg" | "svg";

export function normalizeSnapshotFormat(format: string | null | undefined): SnapshotFormat {
  const normalized = format?.trim().toLowerCase();
  if (normalized === "jpg" || normalized === "jpeg") return "jpg";
  if (normalized === "svg") return "svg";
  return "png";
}

export function getSnapshotMimeType(format: SnapshotFormat) {
  if (format === "svg") return "image/svg+xml";
  if (format === "jpg") return "image/jpeg";
  return "image/png";
}

export function parseSnapshotVersion(requested: string): {
  version: string;
  format: SnapshotFormat;
} {
  const match = requested.match(/^(.*)\.(svg|png|jpe?g)$/i);
  if (!match) {
    return { version: requested, format: "png" };
  }
  return {
    version: match[1],
    format: normalizeSnapshotFormat(match[2])
  };
}

export function getSnapshotPath(
  gameId: string,
  version: string,
  size?: number,
  format: SnapshotFormat = "png"
) {
  const safeGameId = encodeURIComponent(gameId);
  const safeVersion = encodeURIComponent(version);
  const path = `/api/snapshots/${safeGameId}/${safeVersion}.${format}`;
  if (!size) {
    return path;
  }
  return `${path}?size=${size}`;
}
