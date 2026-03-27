import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Issue, Comment, IssueType, Priority, Status } from "@/lib/types";

export function useIssues(projectKey: string, filters?: Record<string, string>) {
  return useQuery<Issue[]>({
    queryKey: ["issues", projectKey, filters],
    queryFn: () => {
      const params = new URLSearchParams(filters || {});
      const qs = params.toString();
      return apiFetch(`/projects/${projectKey}/issues${qs ? `?${qs}` : ""}`);
    },
    enabled: !!projectKey,
  });
}

export function useIssue(id: number) {
  return useQuery<Issue>({
    queryKey: ["issues", "detail", id],
    queryFn: () => apiFetch(`/issues/${id}`),
    enabled: !!id,
  });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectKey, data }: { projectKey: string, data: Partial<Issue> }) => 
      apiFetch<Issue>(`/projects/${projectKey}/issues`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["issues", variables.projectKey] });
    },
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number, data: Partial<Issue> }) => 
      apiFetch<Issue>(`/issues/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["issues", "detail", data.id] });
    },
  });
}

export function useUpdateIssueStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number, status: Status }) => 
      apiFetch<Issue>(`/issues/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["issues", "detail", data.id] });
    },
  });
}

export function useDeleteIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => 
      apiFetch(`/issues/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    },
  });
}

export function useComments(issueId: number) {
  return useQuery<Comment[]>({
    queryKey: ["comments", issueId],
    queryFn: () => apiFetch(`/issues/${issueId}/comments`),
    enabled: !!issueId,
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, content }: { issueId: number, content: string }) => 
      apiFetch<Comment>(`/issues/${issueId}/comments`, { method: "POST", body: JSON.stringify({ content }) }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["comments", variables.issueId] });
    },
  });
}
