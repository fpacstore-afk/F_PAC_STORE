const DEFAULT_GRAPH_VERSION = "v25.0";
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

export type InstagramFeedItem = {
  id: string;
  caption: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaUrl: string;
  permalink: string;
  timestamp: string;
};

type InstagramApiMedia = {
  id?: unknown;
  caption?: unknown;
  media_type?: unknown;
  media_url?: unknown;
  permalink?: unknown;
  thumbnail_url?: unknown;
  timestamp?: unknown;
};

type InstagramApiResponse = {
  data?: InstagramApiMedia[];
};

type FeedCache = {
  items: InstagramFeedItem[];
  fetchedAt: string;
  expiresAt: number;
};

let feedCache: FeedCache | null = null;

const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";

export const normalizeInstagramMedia = (media: InstagramApiMedia): InstagramFeedItem | null => {
  const id = stringValue(media.id);
  const permalink = stringValue(media.permalink);
  const rawType = stringValue(media.media_type);
  const mediaType = rawType === "VIDEO" || rawType === "CAROUSEL_ALBUM" ? rawType : "IMAGE";
  const mediaUrl = mediaType === "VIDEO"
    ? stringValue(media.thumbnail_url) || stringValue(media.media_url)
    : stringValue(media.media_url);

  if (!id || !permalink || !mediaUrl) return null;

  return {
    id,
    caption: stringValue(media.caption),
    mediaType,
    mediaUrl,
    permalink,
    timestamp: stringValue(media.timestamp),
  };
};

export const isInstagramConfigured = () => Boolean(process.env.INSTAGRAM_ACCESS_TOKEN?.trim());

export const getInstagramFeed = async (limit = 6) => {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (!token) {
    return { configured: false, items: [] as InstagramFeedItem[], fetchedAt: null as string | null, stale: false };
  }

  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 6, 1), 12);
  const now = Date.now();
  if (feedCache && feedCache.expiresAt > now && feedCache.items.length >= safeLimit) {
    return { configured: true, items: feedCache.items.slice(0, safeLimit), fetchedAt: feedCache.fetchedAt, stale: false };
  }

  const version = process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
  const endpoint = new URL(`https://graph.instagram.com/${version}/me/media`);
  endpoint.searchParams.set("fields", "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp");
  endpoint.searchParams.set("limit", String(Math.max(safeLimit, 8)));
  endpoint.searchParams.set("access_token", token);

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Instagram Graph API responded with HTTP ${response.status}`);
    }

    const payload = await response.json() as InstagramApiResponse;
    const items = (Array.isArray(payload.data) ? payload.data : [])
      .map(normalizeInstagramMedia)
      .filter((item): item is InstagramFeedItem => item !== null)
      .sort((a, b) => Date.parse(b.timestamp || '') - Date.parse(a.timestamp || ''))
      .slice(0, 12);
    const fetchedAt = new Date().toISOString();

    feedCache = { items, fetchedAt, expiresAt: now + CACHE_TTL_MS };
    return { configured: true, items: items.slice(0, safeLimit), fetchedAt, stale: false };
  } catch (error) {
    if (feedCache) {
      return { configured: true, items: feedCache.items.slice(0, safeLimit), fetchedAt: feedCache.fetchedAt, stale: true };
    }
    throw error;
  }
};
