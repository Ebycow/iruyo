import { NextResponse } from "next/server";
import {
  ACCESS_JWT_HEADER,
  isAccessAllowed,
} from "@shared/auth/cloudflare-access";

export async function requireAccess(request: Request) {
  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (await isAccessAllowed(token)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
