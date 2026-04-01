const { logger } = require("../utils/logger");

class MemoryStore {
  constructor() {
    this.hits = new Map();
  }

  async increment(key, windowMs) {
    const now = Date.now();
    const existing = this.hits.get(key);
    if (!existing || existing.expiresAt <= now) {
      const expiresAt = now + windowMs;
      this.hits.set(key, { count: 1, expiresAt });
      return { count: 1, resetInMs: windowMs };
    }
    existing.count += 1;
    return { count: existing.count, resetInMs: Math.max(0, existing.expiresAt - now) };
  }
}

class RedisStore {
  constructor(client) {
    this.client = client;
  }

  async increment(key, windowMs) {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.pExpire(key, windowMs);
    }
    const ttl = await this.client.pTTL(key);
    return { count, resetInMs: ttl > 0 ? ttl : windowMs };
  }
}

let sharedStore;

async function createRedisStore() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  try {
    // Optional runtime dependency.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { createClient } = require("redis");
    const client = createClient({ url: redisUrl });
    client.on("error", (error) => {
      logger.error("Redis rate-limit client error", { message: error.message });
    });
    await client.connect();
    logger.info("Redis rate-limit store enabled");
    return new RedisStore(client);
  } catch (error) {
    logger.warn("Redis store unavailable, falling back to memory", { message: error.message });
    return null;
  }
}

async function getRateLimitStore() {
  if (sharedStore) return sharedStore;
  sharedStore = (await createRedisStore()) || new MemoryStore();
  return sharedStore;
}

module.exports = { getRateLimitStore };

