import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export interface AuthUser {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  profileImage?: string;
  isAdmin: boolean;
  status: "pending" | "approved" | "rejected";
}

// Register Supabase token getter once — all API calls will include Bearer token automatically.
// supabase.auth.getSession() reads from in-memory cache (no network call) when token is fresh.
setAuthTokenGetter(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
});

async function fetchUserFromBackend(accessToken: string): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { isAuthenticated: boolean; user?: AuthUser };
    return data.isAuthenticated && data.user ? data.user : null;
  } catch {
    return null;
  }
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const handleSession = async (session: Session | null) => {
      console.log("[useAuth] handleSession", session ? "has session" : "no session");
      if (!session?.access_token) {
        if (!cancelled) { setUser(null); setIsLoading(false); }
        return;
      }
      const u = await fetchUserFromBackend(session.access_token);
      console.log("[useAuth] backend user result:", u);
      if (!cancelled) { setUser(u); setIsLoading(false); }
    };

    // Load initial session from Supabase cache
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[useAuth] getSession result:", session ? "has session" : "no session");
      if (!cancelled) handleSession(session);
    });

    // React to sign-in / sign-out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[useAuth] onAuthStateChange event:", event, session ? "has session" : "no session");
      if (!cancelled) handleSession(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(() => {
    window.location.href = "/login";
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/api/logout";
  }, []);

  return { user, isLoading, isAuthenticated: !!user, login, logout };
}
