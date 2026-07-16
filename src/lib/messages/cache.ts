/**
 * Local-first message cache (IndexedDB) — the "Telegram-speed" layer.
 *
 * A conversation you've already opened is rendered INSTANTLY from this on-disk
 * cache while the network fetch reconciles in the background — so re-opening a
 * chat never waits on a round-trip. The server stays the source of truth (the
 * ChatWindow refetch overwrites the cache); this only removes the wait for the
 * *first paint* of a previously-seen conversation.
 *
 * Dependency-free (mirrors the house style of `my-conversations.ts`). Degrades
 * to a silent no-op when IndexedDB is unavailable (SSR, private mode, old
 * browsers) — callers get `null`/nothing and fall back to their normal path.
 *
 * Scope: DM + group conversations only. Server channels are intentionally NOT
 * cached here (their visibility depends on live permissions / bans / NSFW gates).
 */

const DB_NAME = 'prosto-messages';
const DB_VERSION = 1;
const STORE = 'dm_messages';

/** Keep the cache bounded: at most this many messages per conversation… */
const MAX_MSGS_PER_CONV = 100;
/** …and at most this many conversations total (LRU-trimmed by `at`). */
const MAX_CONVS = 60;

/** A cached conversation record. `messages` is the tail (chronological). */
interface CacheRecord<T> {
  conversationId: string;
  at: number;
  messages: T[];
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Open (once) the IndexedDB database, or resolve null when unavailable. */
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'conversationId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Promisify a single-object-store transaction. */
function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/**
 * Read the cached tail for a conversation, or null when nothing is cached / IDB
 * is unavailable. Never throws.
 */
export async function readCachedMessages<T>(conversationId: string): Promise<T[] | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = tx(db, 'readonly').get(conversationId);
      req.onsuccess = () => {
        const rec = req.result as CacheRecord<T> | undefined;
        resolve(rec?.messages?.length ? rec.messages : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Write (replace) the cached tail for a conversation. Keeps only the last
 * MAX_MSGS_PER_CONV messages, and LRU-trims the store to MAX_CONVS. No-op /
 * swallows errors when IDB is unavailable. Never throws.
 */
export async function writeCachedMessages<T>(conversationId: string, messages: T[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const tail = messages.length > MAX_MSGS_PER_CONV ? messages.slice(-MAX_MSGS_PER_CONV) : messages;
  const rec: CacheRecord<T> = { conversationId, at: Date.now(), messages: tail };
  await new Promise<void>((resolve) => {
    try {
      const store = tx(db, 'readwrite');
      store.put(rec);
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => resolve();
      store.transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  void trim(db);
}

/** Drop a conversation's cache (e.g. when it's hidden/deleted). Never throws. */
export async function clearCachedMessages(conversationId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const store = tx(db, 'readwrite');
      store.delete(conversationId);
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** LRU-trim the store to MAX_CONVS by oldest `at`. Best-effort. */
async function trim(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const store = tx(db, 'readwrite');
      const all = store.getAll();
      all.onsuccess = () => {
        const recs = (all.result as CacheRecord<unknown>[]) ?? [];
        if (recs.length <= MAX_CONVS) { resolve(); return; }
        recs.sort((a, b) => a.at - b.at); // oldest first
        const doomed = recs.slice(0, recs.length - MAX_CONVS);
        for (const r of doomed) store.delete(r.conversationId);
        store.transaction.oncomplete = () => resolve();
        store.transaction.onerror = () => resolve();
      };
      all.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
