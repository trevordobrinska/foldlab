// Every Game shares one browser origin with the Arcade and the other Games, so
// every saved-data name starts with this Game's slug (suite rule 2). Save
// through these helpers and the rule is met without remembering it.
//
// Write names the plain way (SLUG + ":" + key, or a string literal): the
// Arcade's Ready check reads them from the source and fails what it can't read.

export const SLUG = "foldlab";

/** A localStorage value saved under "foldlab:<key>", or null. */
export function load(key: string): string | null {
  return localStorage.getItem(SLUG + ":" + key);
}

export function save(key: string, value: string): void {
  localStorage.setItem(SLUG + ":" + key, value);
}

export function forget(key: string): void {
  localStorage.removeItem(SLUG + ":" + key);
}

/**
 * Opens this Game's IndexedDB database, named after the slug. `upgrade` runs
 * when `version` is new, to create or change object stores.
 */
export function openDatabase(version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SLUG, version);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
