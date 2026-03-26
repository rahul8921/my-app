import { numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  team1: varchar("team1").notNull(),
  team2: varchar("team2").notNull(),
  matchDate: timestamp("match_date", { withTimezone: true }).notNull(),
  status: varchar("status", { enum: ["upcoming", "live", "finished"] })
    .notNull()
    .default("upcoming"),
  winner: varchar("winner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const betsTable = pgTable("bets", {
  id: serial("id").primaryKey(),
  matchId: serial("match_id")
    .notNull()
    .references(() => matchesTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  team: varchar("team").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  payout: numeric("payout", { precision: 12, scale: 2 }),
  status: varchar("status", { enum: ["pending", "won", "lost"] })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMatchSchema = createInsertSchema(matchesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBetSchema = createInsertSchema(betsTable).omit({ id: true, createdAt: true });

export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;
export type InsertBet = z.infer<typeof insertBetSchema>;
export type Bet = typeof betsTable.$inferSelect;
