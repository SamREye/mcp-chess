export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AvatarCacheEntry = {
  body: ArrayBuffer;
  contentType: string;
  expiresAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __avatarCache: Map<string, AvatarCacheEntry> | undefined;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const BROWSER_MAX_AGE_SECONDS = 60 * 60 * 24;
const BROWSER_STALE_SECONDS = 60 * 60 * 24 * 7;
const MAX_CACHE_ENTRIES = 256;
const MAX_CACHE_BYTES = 1_500_000;

function getCache() {
  if (!globalThis.__avatarCache) {
    globalThis.__avatarCache = new Map<string, AvatarCacheEntry>();
  }
  return globalThis.__avatarCache;
}

function cacheResponse(url: string, entry: AvatarCacheEntry) {
  const cache = getCache();
  cache.delete(url);
  cache.set(url, entry);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function getCachedResponse(url: string) {
  const cache = getCache();
  const item = cache.get(url);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(url);
    return null;
  }

  // Refresh insertion order to approximate LRU.
  cache.delete(url);
  cache.set(url, item);
  return item;
}

function isAllowedHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "avatars.githubusercontent.com") return true;
  if (host === "secure.gravatar.com") return true;
  return host === "googleusercontent.com" || host.endsWith(".googleusercontent.com");
}

function imageHeaders(contentType: string) {
  return {
    "content-type": contentType,
    "cache-control": `public, max-age=${BROWSER_MAX_AGE_SECONDS}, stale-while-revalidate=${BROWSER_STALE_SECONDS}`,
    "x-avatar-proxy": "1"
  };
}

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const rawUrl = reqUrl.searchParams.get("url")?.trim();
  if (!rawUrl) {
    return Response.json({ error: "Missing url query parameter" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return Response.json({ error: "Invalid avatar URL" }, { status: 400 });
  }

  if (target.protocol !== "https:") {
    return Response.json({ error: "Only HTTPS avatar URLs are allowed" }, { status: 400 });
  }

  if (!isAllowedHost(target.hostname)) {
    return Response.json({ error: "Avatar host is not allowed" }, { status: 400 });
  }

  const cacheKey = target.toString();
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    return new Response(cached.body.slice(0), {
      status: 200,
      headers: imageHeaders(cached.contentType)
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(cacheKey, {
      cache: "no-store",
      headers: {
        accept: "image/*"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5_000)
    });
  } catch {
    return Response.json({ error: "Unable to fetch avatar" }, { status: 502 });
  }

  if (!upstream.ok) {
    return Response.json(
      { error: `Avatar provider returned ${upstream.status}` },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return Response.json({ error: "Avatar URL did not return an image" }, { status: 415 });
  }

  const body = await upstream.arrayBuffer();

  if (body.byteLength <= MAX_CACHE_BYTES) {
    cacheResponse(cacheKey, {
      body: body.slice(0),
      contentType,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
  }

  return new Response(body, {
    status: 200,
    headers: imageHeaders(contentType)
  });
}
