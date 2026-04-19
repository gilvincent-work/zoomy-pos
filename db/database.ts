import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;
let _pending: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (!_pending) {
    _pending = SQLite.openDatabaseAsync('zoomy-pos.db').then((db) => {
      _db = db;
      _pending = null;
      return db;
    });
  }
  return _pending;
}
