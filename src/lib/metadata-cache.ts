/**
 * Persistent metadata cache using IndexedDB.
 * Stores host/item ID mappings for instant dashboard load
 * AND Zabbix navigation tree (groups/hosts) for instant browser load.
 */

const DB_NAME = "flowpulse-meta";
const DB_VERSION = 2;
const STORE_NAME = "telemetry-meta";
const NAV_STORE = "zabbix-nav";

interface MetaCacheEntry {
  key: string;
  dashboardId: string;
  hostId?: string;
  itemId?: string;
  widgetType?: string;
  updatedAt: number;
}

export interface NavCacheEntry {
  cacheKey: string; // e.g. "groups:<connId>" or "hosts:<connId>:<groupId>"
  data: unknown[];
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("byDashboard", "dashboardId", { unique: false });
      }
      if (!db.objectStoreNames.contains(NAV_STORE)) {
        db.createObjectStore(NAV_STORE, { keyPath: "cacheKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

// ── Telemetry metadata ──

export async function getMetaForDashboard(dashboardId: string): Promise<MetaCacheEntry[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const idx = tx.objectStore(STORE_NAME).index("byDashboard");
      const req = idx.getAll(dashboardId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function setMetaForDashboard(
  dashboardId: string,
  entries: Array<{ key: string; hostId?: string; itemId?: string; widgetType?: string }>
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const now = Date.now();
    for (const entry of entries) {
      store.put({ key: entry.key, dashboardId, hostId: entry.hostId, itemId: entry.itemId, widgetType: entry.widgetType, updatedAt: now } satisfies MetaCacheEntry);
    }
    return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  } catch {}
}

export async function clearMetaForDashboard(dashboardId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index("byDashboard");
    const req = idx.openCursor(dashboardId);
    req.onsuccess = () => { const cursor = req.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  } catch {}
}

// ── Zabbix navigation cache (groups/hosts) ──

export async function getNavCache(cacheKey: string): Promise<unknown[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NAV_STORE, "readonly");
      const req = tx.objectStore(NAV_STORE).get(cacheKey);
      req.onsuccess = () => {
        const entry = req.result as NavCacheEntry | undefined;
        if (!entry) return resolve(null);
        // Stale after 10 minutes — still return data, caller revalidates
        resolve(entry.data);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setNavCache(cacheKey: string, data: unknown[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(NAV_STORE, "readwrite");
    tx.objectStore(NAV_STORE).put({ cacheKey, data, updatedAt: Date.now() } satisfies NavCacheEntry);
    return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  } catch {}
}
