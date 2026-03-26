import { Router } from "express";
import { db, driverProfilesTable, ridesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /driver/profile
router.get("/driver/profile", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [profile] = await db.select().from(driverProfilesTable).where(eq(driverProfilesTable.userId, userId));
  if (!profile) return res.json({ profile: null });

  const [user] = await db.select({ username: usersTable.username, profileImageUrl: usersTable.profileImageUrl })
    .from(usersTable).where(eq(usersTable.id, userId));

  return res.json({
    profile: {
      ...profile,
      username: user?.username ?? null,
      profileImageUrl: user?.profileImageUrl ?? null,
      currentLat: profile.currentLat ? parseFloat(profile.currentLat as string) : null,
      currentLng: profile.currentLng ? parseFloat(profile.currentLng as string) : null,
      rating: profile.rating ? parseFloat(profile.rating as string) : null,
      totalEarnings: parseFloat(profile.totalEarnings as string),
    },
  });
});

// POST /driver/register
router.post("/driver/register", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [existing] = await db.select().from(driverProfilesTable).where(eq(driverProfilesTable.userId, userId));
  if (existing) return res.status(400).json({ error: "Already registered as a driver" });

  const { vehicle, licensePlate } = req.body;
  if (!vehicle || !licensePlate) return res.status(400).json({ error: "vehicle and licensePlate are required" });

  const [profile] = await db.insert(driverProfilesTable)
    .values({ userId, vehicle, licensePlate })
    .returning();

  const [user] = await db.select({ username: usersTable.username, profileImageUrl: usersTable.profileImageUrl })
    .from(usersTable).where(eq(usersTable.id, userId));

  return res.status(201).json({
    ...profile,
    username: user?.username ?? null,
    profileImageUrl: user?.profileImageUrl ?? null,
    currentLat: null,
    currentLng: null,
    rating: null,
    totalEarnings: 0,
  });
});

// PATCH /driver/availability
router.patch("/driver/availability", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [profile] = await db.select().from(driverProfilesTable).where(eq(driverProfilesTable.userId, userId));
  if (!profile) return res.status(404).json({ error: "Driver profile not found" });

  const { isAvailable } = req.body;
  if (typeof isAvailable !== "boolean") return res.status(400).json({ error: "isAvailable must be boolean" });

  const [updated] = await db.update(driverProfilesTable)
    .set({ isAvailable })
    .where(eq(driverProfilesTable.userId, userId))
    .returning();

  const [user] = await db.select({ username: usersTable.username, profileImageUrl: usersTable.profileImageUrl })
    .from(usersTable).where(eq(usersTable.id, userId));

  return res.json({
    ...updated,
    username: user?.username ?? null,
    profileImageUrl: user?.profileImageUrl ?? null,
    currentLat: updated.currentLat ? parseFloat(updated.currentLat as string) : null,
    currentLng: updated.currentLng ? parseFloat(updated.currentLng as string) : null,
    rating: updated.rating ? parseFloat(updated.rating as string) : null,
    totalEarnings: parseFloat(updated.totalEarnings as string),
  });
});

// PATCH /driver/location
router.patch("/driver/location", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { lat, lng } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: "lat and lng are required" });

  const [profile] = await db.select().from(driverProfilesTable).where(eq(driverProfilesTable.userId, userId));
  if (!profile) return res.status(404).json({ error: "Driver profile not found" });

  const [updated] = await db.update(driverProfilesTable)
    .set({ currentLat: lat.toString(), currentLng: lng.toString() })
    .where(eq(driverProfilesTable.userId, userId))
    .returning();

  const [user] = await db.select({ username: usersTable.username, profileImageUrl: usersTable.profileImageUrl })
    .from(usersTable).where(eq(usersTable.id, userId));

  return res.json({
    ...updated,
    username: user?.username ?? null,
    profileImageUrl: user?.profileImageUrl ?? null,
    currentLat: lat,
    currentLng: lng,
    rating: updated.rating ? parseFloat(updated.rating as string) : null,
    totalEarnings: parseFloat(updated.totalEarnings as string),
  });
});

// GET /driver/pending-rides — list pending rides for driver to accept
router.get("/driver/pending-rides", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [profile] = await db.select().from(driverProfilesTable).where(eq(driverProfilesTable.userId, userId));
  if (!profile) return res.status(403).json({ error: "Not a driver" });

  const pendingRides = await db.select().from(ridesTable).where(eq(ridesTable.status, "requested"));

  const enriched = await Promise.all(
    pendingRides.map(async (ride) => {
      const [rider] = await db.select({
        id: usersTable.id,
        username: usersTable.username,
        profileImageUrl: usersTable.profileImageUrl,
      }).from(usersTable).where(eq(usersTable.id, ride.riderId));

      return {
        ...ride,
        pickupLat: parseFloat(ride.pickupLat as string),
        pickupLng: parseFloat(ride.pickupLng as string),
        dropoffLat: parseFloat(ride.dropoffLat as string),
        dropoffLng: parseFloat(ride.dropoffLng as string),
        fare: null,
        rider: rider ?? { id: ride.riderId },
        driver: null,
      };
    }),
  );

  return res.json(enriched);
});

export default router;
