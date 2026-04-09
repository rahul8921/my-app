import * as oidc from "openid-client";
import { createClient } from "@supabase/supabase-js";
import { Router, type IRouter, type Request, type Response } from "express";
import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

async function upsertUser(claims: Record<string, unknown>) {
  const userData = {
    id: claims.sub as string,
    email: (claims.email as string) || null,
    username: (claims.username as string) || null,
    firstName: (claims.first_name as string) || null,
    lastName: (claims.last_name as string) || null,
    profileImageUrl: (claims.profile_image_url || claims.picture) as
      | string
      | null,
  };

  // Check if this is the first user ever (make them admin + auto-approved)
  const existingUsers = await db.select().from(usersTable);
  const isFirstUser = existingUsers.length === 0;

  const [user] = await db
    .insert(usersTable)
    .values({
      ...userData,
      isAdmin: isFirstUser,
      status: isFirstUser ? "approved" : "pending",
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        email: userData.email,
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

router.get("/auth/user", async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  if (!req.isAuthenticated()) {
    res.json(GetCurrentAuthUserResponse.parse({ isAuthenticated: false }));
    return;
  }

  // Re-fetch from DB so status/isAdmin are always fresh
  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!dbUser) {
    res.json(GetCurrentAuthUserResponse.parse({ isAuthenticated: false }));
    return;
  }

  res.json(
    GetCurrentAuthUserResponse.parse({
      isAuthenticated: true,
      user: {
        id: dbUser.id,
        username: dbUser.username ?? undefined,
        firstName: dbUser.firstName ?? undefined,
        lastName: dbUser.lastName ?? undefined,
        profileImage: dbUser.customAvatarUrl ?? dbUser.profileImageUrl ?? undefined,
        isAdmin: dbUser.isAdmin,
        status: dbUser.status,
      },
    }),
  );
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      username: dbUser.username ?? undefined,
      firstName: dbUser.firstName ?? undefined,
      lastName: dbUser.lastName ?? undefined,
      profileImage: dbUser.customAvatarUrl ?? dbUser.profileImageUrl ?? undefined,
      isAdmin: dbUser.isAdmin,
      status: dbUser.status,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.patch("/me/photo", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { imageData } = req.body as { imageData?: string };
  if (!imageData || !imageData.startsWith("data:image/")) {
    res.status(400).json({ error: "Invalid image data" });
    return;
  }
  if (imageData.length > 700000) {
    res.status(400).json({ error: "Image too large. Please use a smaller photo." });
    return;
  }
  await db
    .update(usersTable)
    .set({ customAvatarUrl: imageData })
    .where(eq(usersTable.id, req.user.id));
  res.json({ success: true, profileImage: imageData });
});

router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect("/");
});

// ── Supabase auth sync ────────────────────────────────────────────────────────

router.post("/auth/supabase/sync", async (req: Request, res: Response) => {
  const { access_token } = req.body as { access_token?: string };

  if (!access_token) {
    res.status(400).json({ error: "access_token required" });
    return;
  }

  const { data: { user: supaUser }, error } = await supabaseAdmin.auth.getUser(access_token);

  if (error || !supaUser) {
    res.status(401).json({ error: "Invalid Supabase token" });
    return;
  }

  const allUsers = await db.select({ id: usersTable.id }).from(usersTable);
  const isFirstUser = allUsers.length === 0;

  const username =
    (supaUser.user_metadata?.username as string | undefined) ||
    supaUser.email?.split("@")[0] ||
    "user";

  const [dbUser] = await db
    .insert(usersTable)
    .values({
      id: supaUser.id,
      email: supaUser.email ?? null,
      username,
      isAdmin: isFirstUser,
      status: isFirstUser ? "approved" : "pending",
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { email: supaUser.email ?? null, updatedAt: new Date() },
    })
    .returning();

  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      username: dbUser.username ?? undefined,
      firstName: dbUser.firstName ?? undefined,
      lastName: dbUser.lastName ?? undefined,
      profileImage: dbUser.customAvatarUrl ?? dbUser.profileImageUrl ?? undefined,
      isAdmin: dbUser.isAdmin,
      status: dbUser.status,
    },
    access_token,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ success: true });
});

// ── Local auth (username/password) ───────────────────────────────────────────

router.post("/auth/local/register", async (req: Request, res: Response) => {
  const { username, password, firstName, lastName, email } = req.body as {
    username?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };

  if (!username?.trim() || !password?.trim()) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username.trim()));

  if (existing) {
    res.status(400).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const allUsers = await db.select({ id: usersTable.id }).from(usersTable);
  const isFirstUser = allUsers.length === 0;

  const [user] = await db
    .insert(usersTable)
    .values({
      username: username.trim(),
      passwordHash,
      email: email?.trim() || null,
      firstName: firstName?.trim() || null,
      lastName: lastName?.trim() || null,
      isAdmin: isFirstUser,
      status: isFirstUser ? "approved" : "pending",
    })
    .returning();

  const sessionData: SessionData = {
    user: {
      id: user.id,
      username: user.username ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      isAdmin: user.isAdmin,
      status: user.status,
    },
    access_token: "local",
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ success: true, isAdmin: user.isAdmin });
});

router.post("/auth/local/login", async (req: Request, res: Response) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  if (!username?.trim() || !password?.trim()) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username.trim()));

  if (!user?.passwordHash) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const sessionData: SessionData = {
    user: {
      id: user.id,
      username: user.username ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      profileImage: user.customAvatarUrl ?? user.profileImageUrl ?? undefined,
      isAdmin: user.isAdmin,
      status: user.status,
    },
    access_token: "local",
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ success: true });
});

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const { code, code_verifier, redirect_uri, state, nonce } = req.body as {
      code?: string;
      code_verifier?: string;
      redirect_uri?: string;
      state?: string;
      nonce?: string;
    };

    if (!code || !code_verifier || !redirect_uri || !state) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          username: dbUser.username ?? undefined,
          firstName: dbUser.firstName ?? undefined,
          lastName: dbUser.lastName ?? undefined,
          profileImage: dbUser.customAvatarUrl ?? dbUser.profileImageUrl ?? undefined,
          isAdmin: dbUser.isAdmin,
          status: dbUser.status,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json({ token: sid });
    } catch (err) {
      req.log.error({ err }, "Mobile token exchange error");
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json({ success: true });
});

export default router;
