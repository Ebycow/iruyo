import { getAccessToken, getClientId, ensureValidToken } from "./auth";
import type { TwitchStream, TwitchUser } from "./types";

const HELIX_BASE = "https://api.twitch.tv/helix";

async function helixFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await ensureValidToken();
  return fetch(`${HELIX_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": getClientId(),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export async function getStreams(
  userIds: string[]
): Promise<TwitchStream[]> {
  if (userIds.length === 0) return [];

  const streams: TwitchStream[] = [];

  // Batch by 100
  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100);
    const params = new URLSearchParams();
    params.set("first", "100");
    for (const id of batch) {
      params.append("user_id", id);
    }

    const res = await helixFetch(`/streams?${params.toString()}`);
    if (!res.ok) {
      console.error(
        `[helix] getStreams failed: ${res.status} ${await res.text()}`
      );
      continue;
    }

    const data = await res.json();
    streams.push(...data.data);
  }

  return streams;
}

export async function getUsers(logins: string[]): Promise<TwitchUser[]> {
  if (logins.length === 0) return [];

  const users: TwitchUser[] = [];

  for (let i = 0; i < logins.length; i += 100) {
    const batch = logins.slice(i, i + 100);
    const params = new URLSearchParams();
    for (const login of batch) {
      params.append("login", login);
    }

    const res = await helixFetch(`/users?${params.toString()}`);
    if (!res.ok) {
      console.error(
        `[helix] getUsers failed: ${res.status} ${await res.text()}`
      );
      continue;
    }

    const data = await res.json();
    users.push(...data.data);
  }

  return users;
}

export async function getUsersById(ids: string[]): Promise<TwitchUser[]> {
  if (ids.length === 0) return [];

  const users: TwitchUser[] = [];

  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const params = new URLSearchParams();
    for (const id of batch) {
      params.append("id", id);
    }

    const res = await helixFetch(`/users?${params.toString()}`);
    if (!res.ok) {
      console.error(
        `[helix] getUsersById failed: ${res.status} ${await res.text()}`
      );
      continue;
    }

    const data = await res.json();
    users.push(...data.data);
  }

  return users;
}
