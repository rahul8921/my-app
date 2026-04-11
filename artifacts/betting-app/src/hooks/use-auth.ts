import { useEffect, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

export const AUTH_QUERY_KEY = ["/api/auth/user"] as const;

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

export function useAuth(): AuthState {
  const queryClient = useQueryClient();

  const { data: user = null, isLoading } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;
      return fetchUserFromBackend(session.access_token);
    },
    staleTime: Infinity,      // never auto-refetch — auth is event-driven
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Subscribe to Supabase auth events and invalidate the cached user on change.
  // Multiple components calling useAuth() all subscribe, but invalidateQueries is
  // idempotent so the actual refetch only happens once.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      // On login, trigger a fresh match sync so live scores and statuses are up to date
      if (event === 'SIGNED_IN') {
        queryClient.invalidateQueries({ queryKey: ['/api/matches'] });
      }
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  const login = useCallback(() => {
    window.location.href = "/login";
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    window.location.href = "/api/logout";
  }, [queryClient]);

  return { user, isLoading, isAuthenticated: !!user, login, logout };
}
