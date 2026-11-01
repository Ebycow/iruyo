import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

type Verifier = (token: string) => Promise<unknown>;

let verifier: Verifier | null | undefined;

function getVerifier(): Verifier | null {
  if (verifier !== undefined) return verifier;

  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const audience = process.env.CF_ACCESS_AUD?.trim();

  if (!teamDomain && !audience) {
    verifier = null;
    return verifier;
  }

  // 片方だけの設定で検証が無効にならないよう、設定ミスとして止める
  if (!teamDomain || !audience) {
    throw new Error(
      "CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set together"
    );
  }

  const issuer = `https://${teamDomain}`;
  const jwks = createRemoteJWKSet(
    new URL(`${issuer}/cdn-cgi/access/certs`)
  );
  verifier = (token) =>
    jwtVerify(token, jwks, { issuer, audience, algorithms: ["RS256"] });
  return verifier;
}

export function isAccessEnabled(): boolean {
  return getVerifier() !== null;
}

export async function isAccessAllowed(
  token: string | null | undefined
): Promise<boolean> {
  const verify = getVerifier();
  if (!verify) return true;
  if (!token) return false;

  try {
    await verify(token);
    return true;
  } catch (err) {
    console.warn(
      `[access] JWT verification failed: ${err instanceof Error ? err.message : err}`
    );
    return false;
  }
}
