const BASE = "/jira-api";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const isAuth = path.startsWith("/api/auth");
  const url = isAuth ? path : `${BASE}${path}`;
  
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `HTTP error ${res.status}`);
  }

  // Handle empty responses
  const text = await res.text();
  return text ? JSON.parse(text) : {} as T;
}
