const DB = "konomi";
const STORE = "kv";

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error("storage transaction aborted"));
      }),
  );
}

export async function get<T>(key: string): Promise<T | null> {
  return (await run<T | undefined>("readonly", (s) => s.get(key))) ?? null;
}

export async function put(key: string, value: unknown): Promise<void> {
  await run("readwrite", (s) => s.put(value, key));
}

export async function remove(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
}

export const STORE_KEY = "store";
export const AUTH_KEY = "auth";
