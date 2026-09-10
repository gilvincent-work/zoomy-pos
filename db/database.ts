import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;
let _pending: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Open (once) and return the SQLite database. On web the store is wa-sqlite over
 * OPFS, whose access handle is an EXCLUSIVE lock — right after a reload the prior
 * page's handle may not have released yet, so openDatabaseAsync can reject
 * transiently. We must clear `_pending` on rejection; otherwise the rejected
 * promise stays cached and every later call (and every retry) returns the same
 * failure, forcing a full page refresh to recover. Resetting it lets a caller
 * retry the open in the same page load. See app/_layout.tsx (bootstrap retry).
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (!_pending) {
    _pending = SQLite.openDatabaseAsync('zoomy-pos.db')
      .then((db) => {
        _db = db;
        _pending = null;
        return db;
      })
      .catch((err) => {
        _pending = null; // allow a fresh open on the next call (transient OPFS lock)
        throw err;
      });
  }
  return _pending;
}
