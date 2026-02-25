import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

function getDb() {
  const dbPath =
    process.env.DATABASE_PATH ||
    path.join(process.cwd(), "data", "iruyo.db");
  return new Database(dbPath, { readonly: true });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    parseInt(searchParams.get("limit") || "50", 10),
    200
  );
  const chatterUserId = searchParams.get("chatterUserId");

  const sqlite = getDb();
  try {
    let rows;
    if (chatterUserId) {
      rows = sqlite
        .prepare(
          "SELECT * FROM events WHERE chatter_user_id = ? ORDER BY detected_at DESC LIMIT ?"
        )
        .all(chatterUserId, limit);
    } else {
      rows = sqlite
        .prepare("SELECT * FROM events ORDER BY detected_at DESC LIMIT ?")
        .all(limit);
    }
    return NextResponse.json(rows);
  } finally {
    sqlite.close();
  }
}
