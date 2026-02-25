import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbPath =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "iruyo.db");

function moveIfExists(filePath: string, suffix: string) {
  if (!fs.existsSync(filePath)) return;
  const backupPath = `${filePath}.${suffix}`;
  fs.renameSync(filePath, backupPath);
}

function openSqliteWithRecovery(databasePath: string) {
  try {
    const database = new Database(databasePath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    return database;
  } catch (err: any) {
    if (err?.code !== "SQLITE_CORRUPT") {
      throw err;
    }

    const backupSuffix = `corrupt-${Date.now()}`;
    const walPath = `${databasePath}-wal`;
    const shmPath = `${databasePath}-shm`;

    console.warn(
      `[db] SQLITE_CORRUPT detected. Moving WAL/SHM and retrying: ${walPath}, ${shmPath}`
    );
    moveIfExists(walPath, backupSuffix);
    moveIfExists(shmPath, backupSuffix);

    const database = new Database(databasePath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    return database;
  }
}

const sqlite = openSqliteWithRecovery(dbPath);

export const db = drizzle(sqlite, { schema });
export { schema };
export { sqlite };
