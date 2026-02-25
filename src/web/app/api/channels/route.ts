import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

function getDb() {
  const dbPath =
    process.env.DATABASE_PATH ||
    path.join(process.cwd(), "data", "iruyo.db");
  const sqlite = new Database(dbPath, { readonly: true });
  return sqlite;
}

export async function GET() {
  const sqlite = getDb();
  try {
    const rows = sqlite
      .prepare("SELECT * FROM channels ORDER BY is_live DESC, login ASC")
      .all();
    return NextResponse.json(rows);
  } finally {
    sqlite.close();
  }
}
