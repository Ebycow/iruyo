import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

let currentAccessToken = process.env.TWITCH_BOT_ACCESS_TOKEN || "";
let currentRefreshToken = process.env.TWITCH_BOT_REFRESH_TOKEN || "";

async function refreshAccessToken() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret || !currentRefreshToken) {
    throw new Error("Twitch credentials not configured");
  }

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: currentRefreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twitch token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  currentAccessToken = data.access_token;
  if (data.refresh_token) {
    currentRefreshToken = data.refresh_token;
  }
}

function getDb(readonly = false) {
  const dbPath =
    process.env.DATABASE_PATH ||
    path.join(process.cwd(), "data", "iruyo.db");
  return new Database(dbPath, { readonly });
}

async function resolveTwitchUser(login: string) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  let token = currentAccessToken;
  if (!clientId || !token) {
    throw new Error("Twitch credentials not configured");
  }

  const params = new URLSearchParams({ login });
  let res = await fetch(
    `https://api.twitch.tv/helix/users?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
      },
    }
  );

  if (res.status === 401) {
    await refreshAccessToken();
    token = currentAccessToken;
    res = await fetch(
      `https://api.twitch.tv/helix/users?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": clientId,
        },
      }
    );
  }

  if (!res.ok) {
    throw new Error(`Twitch API error: ${res.status}`);
  }

  const data = await res.json();
  if (!data.data || data.data.length === 0) {
    return null;
  }

  const user = data.data[0];
  return {
    userId: user.id as string,
    login: user.login as string,
    displayName: user.display_name as string,
    profileImageUrl: user.profile_image_url as string,
  };
}

export async function GET() {
  const sqlite = getDb(true);
  try {
    const rows = sqlite
      .prepare("SELECT * FROM watch_targets ORDER BY login ASC")
      .all();
    const data = rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      login: row.login,
      displayName: row.display_name,
      profileImageUrl: row.profile_image_url ?? null,
      notifyDiscord: Boolean(row.notify_discord),
      createdAt: row.created_at,
    }));
    return NextResponse.json(data);
  } finally {
    sqlite.close();
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  let { userId, login, displayName, profileImageUrl } = body;

  if (!userId && !login) {
    return NextResponse.json(
      { error: "login is required" },
      { status: 400 }
    );
  }

  // Resolve user via Twitch API if only login is provided
  if (!userId) {
    const resolved = await resolveTwitchUser(login);
    if (!resolved) {
      return NextResponse.json(
        { error: `Twitch user "${login}" not found` },
        { status: 404 }
      );
    }
    userId = resolved.userId;
    login = resolved.login;
    displayName = resolved.displayName;
    profileImageUrl = resolved.profileImageUrl;
  }

  const sqlite = getDb();
  try {
    sqlite
      .prepare(
        `INSERT INTO watch_targets (user_id, login, display_name, profile_image_url)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           login = excluded.login,
           display_name = excluded.display_name,
           profile_image_url = excluded.profile_image_url`
      )
      .run(userId, login, displayName || login, profileImageUrl || null);

    const row = sqlite
      .prepare(
        "SELECT user_id, login, display_name, profile_image_url, notify_discord FROM watch_targets WHERE user_id = ?"
      )
      .get(userId) as
      | {
          user_id: string;
          login: string;
          display_name: string;
          profile_image_url: string | null;
          notify_discord: number;
        }
      | undefined;

    return NextResponse.json({
      ok: true,
      target: {
        userId: row?.user_id || userId,
        login: row?.login || login,
        displayName: row?.display_name || displayName || login,
        profileImageUrl: row?.profile_image_url ?? profileImageUrl ?? null,
        notifyDiscord: Boolean(row?.notify_discord),
      },
    });
  } finally {
    sqlite.close();
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { userId, notifyDiscord } = body;

  if (!userId || typeof notifyDiscord !== "boolean") {
    return NextResponse.json(
      { error: "userId and notifyDiscord are required" },
      { status: 400 }
    );
  }

  const sqlite = getDb();
  try {
    sqlite
      .prepare(
        "UPDATE watch_targets SET notify_discord = ? WHERE user_id = ?"
      )
      .run(notifyDiscord ? 1 : 0, userId);
    return NextResponse.json({
      ok: true,
      target: { userId, notifyDiscord },
    });
  } finally {
    sqlite.close();
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: "userId query param required" },
      { status: 400 }
    );
  }

  const sqlite = getDb();
  try {
    sqlite
      .prepare("DELETE FROM watch_targets WHERE user_id = ?")
      .run(userId);
    return NextResponse.json({ ok: true });
  } finally {
    sqlite.close();
  }
}
