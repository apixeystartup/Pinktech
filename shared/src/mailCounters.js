/**
 * Best-effort per-provider send counters, stored in MongoDB.
 *
 * Why Mongo and not an in-process counter: the platform runs each microservice
 * as its own Node process (8 services via PM2). An in-memory counter would let
 * every process believe it holds a full daily quota, so the fleet would blow
 * past a provider's real cap. Mongo is already a dependency of every service,
 * which makes it the only naturally shared store.
 *
 * Counters influence provider ORDER only. They never decide whether a send is
 * attempted: an under-count therefore costs one wasted round-trip, while an
 * over-count merely demotes a provider. Correctness always comes from the
 * provider's own response.
 */

const mongoose = require("mongoose");

const COLLECTION = "emailprovidercounters";
let indexEnsured = false;

function nowParts(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const hour = `${day}T${date.toISOString().slice(11, 13)}`;
  return { day, hour };
}

function collection() {
  if (mongoose.connection?.readyState !== 1) return null;
  return mongoose.connection.collection(COLLECTION);
}

async function ensureIndexes() {
  if (indexEnsured) return;
  const col = collection();
  if (!col) return;
  indexEnsured = true;
  try {
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  } catch {
    /* index creation is best-effort */
  }
}

async function readCounter(id) {
  try {
    const col = collection();
    if (!col) return null;
    await ensureIndexes();
    return await col.findOne({ _id: id }, { projection: { count: 1 } });
  } catch {
    return null;
  }
}

/**
 * Daily + hourly usage for one provider.
 * Returns nulls when Mongo is unavailable so callers treat usage as "unknown"
 * and keep the configured order rather than guessing.
 */
async function getUsage(provider) {
  const { day, hour } = nowParts();
  const empty = {
    daily: { count: 0, cap: provider.dailyCap || null, exhausted: false, known: false },
    hourly: { count: 0, cap: provider.hourlyCap || null, exhausted: false, known: false },
  };
  if (!provider.dailyCap && !provider.hourlyCap) return empty;

  const [dayDoc, hourDoc] = await Promise.all([
    provider.dailyCap ? readCounter(`${provider.id}:${day}`) : null,
    provider.hourlyCap ? readCounter(`${provider.id}:${hour}`) : null,
  ]);

  const build = (doc, cap) => {
    if (!doc) {
      return { count: 0, cap, exhausted: false, known: false };
    }
    const count = Number(doc.count) || 0;
    return { count, cap, exhausted: count >= cap, known: true };
  };

  return {
    daily: build(dayDoc, provider.dailyCap),
    hourly: build(hourDoc, provider.hourlyCap),
  };
}

/** Increment daily and hourly counters after a provider accepted a message. */
async function recordSend(provider) {
  try {
    const col = collection();
    if (!col) return;
    await ensureIndexes();
    const { day, hour } = nowParts();
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const ops = [
      {
        updateOne: {
          filter: { _id: `${provider.id}:${day}` },
          update: { $inc: { count: 1 }, $set: { provider: provider.id, date: day, expiresAt } },
          upsert: true,
        },
      },
    ];
    if (provider.hourlyCap) {
      ops.push({
        updateOne: {
          filter: { _id: `${provider.id}:${hour}` },
          update: { $inc: { count: 1 }, $set: { provider: provider.id, hour, expiresAt } },
          upsert: true,
        },
      });
    }
    await col.bulkWrite(ops);
  } catch {
    /* counters are observability, never a send blocker */
  }
}

/**
 * Reorder a chain so providers with headroom are attempted first and
 * likely-exhausted ones are demoted rather than removed. If every provider
 * looks exhausted the original order is preserved, so a stale counter can
 * never silently swallow a send.
 */
async function orderByHeadroom(providers) {
  if (providers.length < 2) return providers;
  const scored = await Promise.all(
    providers.map(async (provider) => {
      let usage = null;
      try {
        usage = await getUsage(provider);
      } catch {
        /* fall through with unknown usage, which is treated as not exhausted */
      }
      const exhausted = Boolean(usage && (usage.daily.exhausted || usage.hourly.exhausted));
      return { provider, exhausted };
    }),
  );
  const headroom = scored.filter((s) => !s.exhausted);
  const demoted = scored.filter((s) => s.exhausted);
  return [...headroom, ...demoted].map((s) => s.provider);
}

module.exports = { getUsage, recordSend, orderByHeadroom, COLLECTION };