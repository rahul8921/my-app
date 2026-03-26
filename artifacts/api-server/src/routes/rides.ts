import { Router } from "express";
import { db, ridesTable, driverProfilesTable, usersTable } from "@workspace/db";
import { eq, or, inArray } from "drizzle-orm";

const router = Router();

function calcFare(pickupLat: number, pickupLng: number, dropLat: number, dropLng: number): number {
  const R = 6371;
  const dLat = ((dropLat - pickupLat) * Math.PI) / 180;
  const dLng = ((dropLng - pickupLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pickupLat * Math.PI) / 180) *
    Math.cos((dropLat * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distKm = R * c;
  const baseFare = 2.5;
  const perKm = 1.8;
  return Math.max(5, parseFloat((baseFare + distKm * perKm).toFixed(2)));
}

async function enrichRide(ride: typeof ridesTable.$inferSelect) {
  const [rider] = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    profileImageUrl: usersTable.profileImageUrl,
  }).from(usersTable).where(eq(usersTable.id, ride.riderId));

  let driver = null;
  if (ride.driverId) {
    const [driverUser] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      profileImageUrl: usersTable.profileImageUrl,
    }).from(usersTable).where(eq(usersTable.id, ride.driverId));
    const [driverProfile] = await db.select().from(driverProfilesTable).where(eq(driverProfilesTable.userId, ride.driverId));
    if (driverUser && driverProfile) {
      driver = {
        id: driverUser.id,
        username: driverUser.username,
        profileImageUrl: driverUser.profileImageUrl,
        vehicle: driverProfile.vehicle,
        licensePlate: driverProfile.licensePlate,
        rating: driverProfile.rating ? parseFloat(driverProfile.rating) : null,
        currentLat: driverProfile.currentLat ? parseFloat(driverProfile.currentLat) : null,
        currentLng: driverProfile.currentLng ? parseFloat(driverProfile.currentLng) : null,
      };
    }
  }

  return {
    ...ride,
    pickupLat: parseFloat(ride.pickupLat as string),
    pickupLng: parseFloat(ride.pickupLng as string),
    dropoffLat: parseFloat(ride.dropoffLat as string),
    dropoffLng: parseFloat(ride.dropoffLng as string),
    fare: ride.fare ? parseFloat(ride.fare as string) : null,
    rider: rider ?? { id: ride.riderId },
    driver,
  };
}

// POST /rides — request a new ride
router.post("/rides", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { pickupAddress, dropoffAddress, pickupLat, pickupLng, dropoffLat, dropoffLng } = req.body;
  if (!pickupAddress || !dropoffAddress || pickupLat == null || pickupLng == null || dropoffLat == null || dropoffLng == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const existingActive = await db
    .select()
    .from(ridesTable)
    .where(
      eq(ridesTable.riderId, userId),
    );
  const hasActive = existingActive.some(r => ["requested", "accepted", "in_progress"].includes(r.status));
  if (hasActive) return res.status(400).json({ error: "You already have an active ride" });

  const [ride] = await db.insert(ridesTable).values({
    riderId: userId,
    pickupAddress,
    dropoffAddress,
    pickupLat: pickupLat.toString(),
    pickupLng: pickupLng.toString(),
    dropoffLat: dropoffLat.toString(),
    dropoffLng: dropoffLng.toString(),
  }).returning();

  return res.status(201).json(await enrichRide(ride));
});

// GET /rides/active — get user's active ride
router.get("/rides/active", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.json({ ride: null });

  const all = await db.select().from(ridesTable).where(
    or(eq(ridesTable.riderId, userId), eq(ridesTable.driverId, userId))
  );
  const active = all.find(r => ["requested", "accepted", "in_progress"].includes(r.status));
  if (!active) return res.json({ ride: null });

  return res.json({ ride: await enrichRide(active) });
});

// GET /rides/history — past rides
router.get("/rides/history", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const all = await db.select().from(ridesTable).where(
    or(eq(ridesTable.riderId, userId), eq(ridesTable.driverId, userId))
  );
  const past = all.filter(r => ["completed", "cancelled"].includes(r.status));
  past.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());

  const enriched = await Promise.all(past.map(enrichRide));
  return res.json(enriched);
});

// POST /rides/:rideId/cancel
router.post("/rides/:rideId/cancel", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, req.params.rideId));
  if (!ride) return res.status(404).json({ error: "Ride not found" });
  if (ride.riderId !== userId && ride.driverId !== userId) return res.status(403).json({ error: "Not your ride" });
  if (!["requested", "accepted"].includes(ride.status)) return res.status(400).json({ error: "Cannot cancel in current state" });

  const [updated] = await db.update(ridesTable).set({ status: "cancelled" }).where(eq(ridesTable.id, ride.id)).returning();
  return res.json(await enrichRide(updated));
});

// POST /rides/:rideId/accept — driver accepts
router.post("/rides/:rideId/accept", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [profile] = await db.select().from(driverProfilesTable).where(eq(driverProfilesTable.userId, userId));
  if (!profile) return res.status(400).json({ error: "You are not registered as a driver" });
  if (!profile.isAvailable) return res.status(400).json({ error: "You are currently offline" });

  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, req.params.rideId));
  if (!ride) return res.status(404).json({ error: "Ride not found" });
  if (ride.status !== "requested") return res.status(400).json({ error: "Ride is no longer available" });

  const [updated] = await db.update(ridesTable)
    .set({ status: "accepted", driverId: userId, acceptedAt: new Date() })
    .where(eq(ridesTable.id, ride.id))
    .returning();
  return res.json(await enrichRide(updated));
});

// POST /rides/:rideId/start — driver picks up rider
router.post("/rides/:rideId/start", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, req.params.rideId));
  if (!ride) return res.status(404).json({ error: "Ride not found" });
  if (ride.driverId !== userId) return res.status(403).json({ error: "Not your ride" });
  if (ride.status !== "accepted") return res.status(400).json({ error: "Ride is not in accepted state" });

  const [updated] = await db.update(ridesTable)
    .set({ status: "in_progress", startedAt: new Date() })
    .where(eq(ridesTable.id, ride.id))
    .returning();
  return res.json(await enrichRide(updated));
});

// POST /rides/:rideId/complete — driver completes ride
router.post("/rides/:rideId/complete", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, req.params.rideId));
  if (!ride) return res.status(404).json({ error: "Ride not found" });
  if (ride.driverId !== userId) return res.status(403).json({ error: "Not your ride" });
  if (ride.status !== "in_progress") return res.status(400).json({ error: "Ride is not in progress" });

  const fare = calcFare(
    parseFloat(ride.pickupLat as string),
    parseFloat(ride.pickupLng as string),
    parseFloat(ride.dropoffLat as string),
    parseFloat(ride.dropoffLng as string),
  );

  const [updated] = await db.update(ridesTable)
    .set({ status: "completed", completedAt: new Date(), fare: fare.toString() })
    .where(eq(ridesTable.id, ride.id))
    .returning();

  // Update driver stats
  const [profile] = await db.select().from(driverProfilesTable).where(eq(driverProfilesTable.userId, userId));
  if (profile) {
    const newEarnings = parseFloat(profile.totalEarnings as string) + fare;
    await db.update(driverProfilesTable)
      .set({ totalRides: profile.totalRides + 1, totalEarnings: newEarnings.toString() })
      .where(eq(driverProfilesTable.userId, userId));
  }

  return res.json(await enrichRide(updated));
});

// POST /rides/:rideId/rate — rider rates
router.post("/rides/:rideId/rate", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, req.params.rideId));
  if (!ride) return res.status(404).json({ error: "Ride not found" });
  if (ride.riderId !== userId) return res.status(403).json({ error: "Not your ride" });
  if (ride.status !== "completed") return res.status(400).json({ error: "Ride not completed" });
  if (ride.riderRating) return res.status(400).json({ error: "Already rated" });

  const { rating } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be 1-5" });

  const [updated] = await db.update(ridesTable)
    .set({ riderRating: rating })
    .where(eq(ridesTable.id, ride.id))
    .returning();

  // Update driver average rating
  if (ride.driverId) {
    const allRides = await db.select({ riderRating: ridesTable.riderRating }).from(ridesTable)
      .where(eq(ridesTable.driverId, ride.driverId));
    const ratings = allRides.filter(r => r.riderRating != null).map(r => r.riderRating!);
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    await db.update(driverProfilesTable)
      .set({ rating: avg.toFixed(2) })
      .where(eq(driverProfilesTable.userId, ride.driverId));
  }

  return res.json(await enrichRide(updated));
});

export default router;
