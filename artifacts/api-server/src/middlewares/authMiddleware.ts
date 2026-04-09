import * as oidc from "openid-client";
import { createClient } from "@supabase/supabase-js";
import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  updateSession,
  type SessionData,
} from "../lib/auth";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(
      config,
      session.refresh_token,
    );
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

async function resolveUserFromBearer(token: string): Promise<AuthUser | null> {
  const { data: { user: supaUser }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !supaUser) return null;

  // Look up user by Supabase UUID first
  let [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, supaUser.id));

  // Fallback: look up by email (handles migrated users logging in for first time via Supabase)
  if (!dbUser && supaUser.email) {
    const [emailUser] = await db.select().from(usersTable).where(eq(usersTable.email, supaUser.email));
    if (emailUser) {
      // Re-link: update the placeholder UUID to the real Supabase UUID
      const [updated] = await db
        .update(usersTable)
        .set({ id: supaUser.id, updatedAt: new Date() })
        .where(eq(usersTable.email, supaUser.email))
        .returning();
      dbUser = updated;
    }
  }

  if (dbUser) {
    return {
      id: dbUser.id,
      username: dbUser.username ?? undefined,
      firstName: dbUser.firstName ?? undefined,
      lastName: dbUser.lastName ?? undefined,
      profileImage: dbUser.customAvatarUrl ?? dbUser.profileImageUrl ?? undefined,
      isAdmin: dbUser.isAdmin,
      status: dbUser.status,
    };
  }

  // Brand new user: create row
  const allUsers = await db.select({ id: usersTable.id }).from(usersTable);
  const isFirstUser = allUsers.length === 0;
  const username =
    (supaUser.user_metadata?.username as string | undefined) ||
    supaUser.email?.split("@")[0] ||
    "user";

  const [newUser] = await db
    .insert(usersTable)
    .values({
      id: supaUser.id,
      email: supaUser.email ?? null,
      username,
      isAdmin: isFirstUser,
      status: isFirstUser ? "approved" : "pending",
    })
    .returning();

  return {
    id: newUser.id,
    username: newUser.username ?? undefined,
    firstName: newUser.firstName ?? undefined,
    lastName: newUser.lastName ?? undefined,
    profileImage: newUser.customAvatarUrl ?? newUser.profileImageUrl ?? undefined,
    isAdmin: newUser.isAdmin,
    status: newUser.status,
  };
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  // ── Bearer token (Supabase JWT) ─────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const user = await resolveUserFromBearer(token);
    if (user) {
      req.user = user;
      next();
      return;
    }
  }

  // ── Cookie-based session (fallback) ─────────────────────────────────────────
  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) {
    await clearSession(res, sid);
    next();
    return;
  }

  req.user = refreshed.user;
  next();
}
