import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { RideWithDetails, DriverProfile } from "@/types";

const BASE = "";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function useGetActiveRide(options?: { query?: { refetchInterval?: number } }) {
  return useQuery<{ ride: RideWithDetails | null }>({
    queryKey: ["rides", "active"],
    queryFn: () => apiFetch("/api/rides/active"),
    refetchInterval: options?.query?.refetchInterval,
  });
}

export function useListRideHistory() {
  return useQuery<RideWithDetails[]>({
    queryKey: ["rides", "history"],
    queryFn: () => apiFetch("/api/rides/history"),
  });
}

export function useRequestRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      pickupAddress: string;
      dropoffAddress: string;
      pickupLat: number;
      pickupLng: number;
      dropoffLat: number;
      dropoffLng: number;
    }) => apiFetch<RideWithDetails>("/api/rides", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rides"] }),
  });
}

export function useCancelRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rideId }: { rideId: string }) =>
      apiFetch<RideWithDetails>(`/api/rides/${rideId}/cancel`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rides"] }),
  });
}

export function useRateRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rideId, data }: { rideId: string; data: { rating: number } }) =>
      apiFetch<RideWithDetails>(`/api/rides/${rideId}/rate`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rides"] }),
  });
}

export function useGetDriverProfile(options?: { query?: { refetchInterval?: number } }) {
  return useQuery<{ profile: DriverProfile | null }>({
    queryKey: ["driver", "profile"],
    queryFn: () => apiFetch("/api/driver/profile"),
    refetchInterval: options?.query?.refetchInterval,
  });
}

export function useListPendingRides(options?: { query?: { refetchInterval?: number; enabled?: boolean } }) {
  return useQuery<RideWithDetails[]>({
    queryKey: ["driver", "pending-rides"],
    queryFn: () => apiFetch("/api/driver/pending-rides"),
    refetchInterval: options?.query?.refetchInterval,
    enabled: options?.query?.enabled,
  });
}

export function useRegisterAsDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { vehicle: string; licensePlate: string }) =>
      apiFetch<DriverProfile>("/api/driver/register", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["driver"] }),
  });
}

export function useUpdateDriverAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { isAvailable: boolean }) =>
      apiFetch("/api/driver/availability", { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["driver"] }),
  });
}

export function useUpdateDriverLocation() {
  return useMutation({
    mutationFn: (data: { lat: number; lng: number }) =>
      apiFetch("/api/driver/location", { method: "PATCH", body: JSON.stringify(data) }),
  });
}

export function useAcceptRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rideId }: { rideId: string }) =>
      apiFetch<RideWithDetails>(`/api/rides/${rideId}/accept`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rides", "driver"] }),
  });
}

export function useStartRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rideId }: { rideId: string }) =>
      apiFetch<RideWithDetails>(`/api/rides/${rideId}/start`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rides"] }),
  });
}

export function useCompleteRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rideId }: { rideId: string }) =>
      apiFetch<RideWithDetails>(`/api/rides/${rideId}/complete`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rides", "driver"] }),
  });
}
