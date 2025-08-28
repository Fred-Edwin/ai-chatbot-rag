import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = process.env.UPSTASH_REDIS_REST_URL 
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
}

export async function getCached<T>(
  key: string,
  fallback: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  if (!redis) {
    return fallback();
  }

  try {
    const cached = await redis.get(key);
    if (cached) {
      return cached as T;
    }

    const data = await fallback();
    const ttl = options.ttl || 300; // 5 minutes default
    await redis.setex(key, ttl, JSON.stringify(data));
    return data;
  } catch (error) {
    console.error('Cache error:', error);
    return fallback();
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}

// Cache keys
export const CACHE_KEYS = {
  knowledgeBases: (userId: string) => `kb:user:${userId}`,
  knowledgeBase: (id: string) => `kb:${id}`,
  documents: (kbId: string) => `docs:kb:${kbId}`,
  embeddings: (text: string) => `emb:${Buffer.from(text).toString('base64').slice(0, 50)}`,
};