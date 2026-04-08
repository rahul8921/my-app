import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { CustomFieldDef } from "@/lib/types";

export function useCustomFields(projectKey: string) {
  return useQuery<CustomFieldDef[]>({
    queryKey: ["custom-fields", projectKey],
    queryFn: () => apiFetch(`/projects/${projectKey}/fields`),
    enabled: !!projectKey,
  });
}

export function useCreateCustomField(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; fieldType: string; options?: string[] }) =>
      apiFetch<CustomFieldDef>(`/projects/${projectKey}/fields`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields", projectKey] });
    },
  });
}

export function useUpdateCustomField(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: { name?: string; options?: string[] } }) =>
      apiFetch<CustomFieldDef>(`/projects/${projectKey}/fields/${fieldId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields", projectKey] });
    },
  });
}

export function useDeleteCustomField(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: string) =>
      apiFetch(`/projects/${projectKey}/fields/${fieldId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields", projectKey] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    },
  });
}

export function useSetCustomFieldValues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, values }: { issueId: string; values: Record<string, string | null> }) =>
      apiFetch<{ customFieldValues: unknown[] }>(`/issues/${issueId}/custom-fields`, {
        method: "PATCH",
        body: JSON.stringify({ values }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["issues", "detail", variables.issueId] });
    },
  });
}
