export interface RideUser {
  id: string;
  username?: string | null;
  profileImageUrl?: string | null;
}

export interface RideDriver extends RideUser {
  vehicle?: string | null;
  licensePlate?: string | null;
  rating?: number | null;
  currentLat?: number | null;
  currentLng?: number | null;
}

export interface RideWithDetails {
  id: string;
  riderId: string;
  driverId?: string | null;
  status: "requested" | "accepted" | "in_progress" | "completed" | "cancelled";
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  fare?: number | null;
  riderRating?: number | null;
  requestedAt: string;
  acceptedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  rider?: RideUser;
  driver?: RideDriver | null;
}

export interface DriverProfile {
  userId: string;
  vehicle: string;
  licensePlate: string;
  isAvailable: boolean;
  rating?: number | null;
  totalEarnings: number;
  totalRides: number;
  currentLat?: number | null;
  currentLng?: number | null;
  username?: string | null;
  profileImageUrl?: string | null;
}

export interface AuthUser {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  profileImage?: string;
  isAdmin: boolean;
  status: "pending" | "approved" | "rejected";
}
