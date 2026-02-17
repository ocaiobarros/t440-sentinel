/**
 * Persistent metadata cache using IndexedDB.
 * Stores host/item ID mappings for instant dashboard load.
 */

const DB_NAME = "flowpulse-meta";
const DB_VERSION = 1;
const STORE_NAME = "telemetry-meta";

interface MetaCacheEntry {
  key: string; // telemetry_key
  dashboardId: string;
  hostId?: string;
  itemId?: string;
  widgetType?: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("byDashboard", "dashboardId", { unique: false });
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
  entries: Array<{
    key: string;
    hostId?: string;
    itemId?: string;
    widgetType?: string;
  }>
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const now = Date.now();
    for (const entry of entries) {
      store.put({
        key: entry.key,
        dashboardId,
        hostId: entry.hostId,
        itemId: entry.itemId,
        widgetType: entry.widgetType,
        updatedAt: now,
      } satisfies MetaCacheEntry);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable — fail silently
  }
}

export async function clearMetaForDashboard(dashboardId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index("byDashboard");
    const req = idx.openCursor(dashboardId);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fail silently
  }
}
