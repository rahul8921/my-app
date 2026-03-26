import { sql } from "drizzle-orm";
import { boolean, index, integer, numeric, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const driverProfilesTable = pgTable("driver_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  vehicle: varchar("vehicle").notNull(),
  licensePlate: varchar("license_plate").notNull(),
  isAvailable: boolean("is_available").notNull().default(false),
  currentLat: numeric("current_lat", { precision: 10, scale: 6 }),
  currentLng: numeric("current_lng", { precision: 10, scale: 6 }),
  rating: numeric("rating", { precision: 3, scale: 2 }),
  totalRides: integer("total_rides").notNull().default(0),
  totalEarnings: numeric("total_earnings", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const ridesTable = pgTable(
  "rides",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    riderId: varchar("rider_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    driverId: varchar("driver_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    status: varchar("status", {
      enum: ["requested", "accepted", "in_progress", "completed", "cancelled"],
    })
      .notNull()
      .default("requested"),
    pickupAddress: text("pickup_address").notNull(),
    dropoffAddress: text("dropoff_address").notNull(),
    pickupLat: numeric("pickup_lat", { precision: 10, scale: 6 }).notNull(),
    pickupLng: numeric("pickup_lng", { precision: 10, scale: 6 }).notNull(),
    dropoffLat: numeric("dropoff_lat", { precision: 10, scale: 6 }).notNull(),
    dropoffLng: numeric("dropoff_lng", { precision: 10, scale: 6 }).notNull(),
    fare: numeric("fare", { precision: 10, scale: 2 }),
    riderRating: integer("rider_rating"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("rides_rider_id_idx").on(table.riderId), index("rides_driver_id_idx").on(table.driverId)],
);

export type DriverProfile = typeof driverProfilesTable.$inferSelect;
export type InsertDriverProfile = typeof driverProfilesTable.$inferInsert;
export type Ride = typeof ridesTable.$inferSelect;
export type InsertRide = typeof ridesTable.$inferInsert;
