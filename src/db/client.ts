import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

export const DATABASE_NAME = 'finz.db';

export const expoDb = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

expoDb.execSync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');

export const db = drizzle(expoDb);
