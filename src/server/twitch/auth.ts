import { config } from "../config";
import type { TwitchTokenResponse } from "./types";

let currentAccessToken = config.twitch.botAccessToken;
let currentRefreshToken = config.twitch.botRefreshToken;
let tokenExpiresAt = 0;

export function getAccessToken(): string {
  return currentAccessToken;
}

export function getClientId(): string {
  return config.twitch.clientId;
}

export async function refreshAccessToken(): Promise<void> {
  if (!currentRefreshToken) {
    throw new Error("[auth] No refresh token available");
  }

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: currentRefreshToken,
      client_id: config.twitch.clientId,
      client_secret: config.twitch.clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[auth] Token refresh failed: ${res.status} ${text}`);
  }

  const data: TwitchTokenResponse = await res.json();
  currentAccessToken = data.access_token;
  if (data.refresh_token) {
    currentRefreshToken = data.refresh_token;
  }
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  console.log(
    `[auth] Token refreshed. Expires in ${data.expires_in}s`
  );
}

export async function ensureValidToken(): Promise<string> {
  // Refresh if expires within 5 minutes
  if (tokenExpiresAt > 0 && Date.now() > tokenExpiresAt - 5 * 60 * 1000) {
    await refreshAccessToken();
  }
  return currentAccessToken;
}

export async function validateToken(): Promise<boolean> {
  const res = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `OAuth ${currentAccessToken}` },
  });

  if (res.ok) {
    const data = await res.json();
    tokenExpiresAt = Date.now() + (data.expires_in ?? 0) * 1000;
    console.log(
      `[auth] Token valid. User: ${data.login}, Expires in: ${data.expires_in}s`
    );
    return true;
  }

  console.warn("[auth] Token invalid, attempting refresh...");
  try {
    await refreshAccessToken();
    return true;
  } catch {
    return false;
  }
}
