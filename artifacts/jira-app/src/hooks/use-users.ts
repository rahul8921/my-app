import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";

export function useUsers() {
  return useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch("/users"),
  });
}

export function useProjectMembers(projectKey: string) {
  return useQuery<User[]>({
    queryKey: ["users", "project", projectKey],
    queryFn: () => apiFetch(`/projects/${projectKey}/members`),
    enabled: !!projectKey,
  });
}
