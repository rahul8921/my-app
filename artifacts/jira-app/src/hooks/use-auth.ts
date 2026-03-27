import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    apiFetch<{ isAuthenticated: boolean; user?: AuthUser }>("/api/auth/user")
      .then((data) => {
        if (mounted) {
          setUser(data.isAuthenticated && data.user ? data.user : null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => { mounted = false; };
  }, []);

  const login = useCallback(() => {
    const base = import.meta.env.BASE_URL?.replace(/\/+$/, "") || "/jira-app";
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base)}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/api/logout";
  }, []);

  return { user, isLoading, isAuthenticated: !!user, login, logout };
}
