import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, betsTable, matchesTable } from "@workspace/db";
import { eq, sum, count } from "drizzle-orm";
import { ApproveUserParams, RejectUserParams } from "@workspace/api-zod";

const router: IRouter = Router();

function isAdmin(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!req.user.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

async function getUserWithStats(userId: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) return null;

  const bets = await db
    .select()
    .from(betsTable)
    .where(eq(betsTable.userId, userId));

  let totalBetAmount = 0;
  let totalWon = 0;
  for (const bet of bets) {
    totalBetAmount += parseFloat(bet.amount as string);
    if (bet.status === "won" && bet.payout) {
      totalWon += parseFloat(bet.payout as string);
    }
  }

  return {
    id: user.id,
    username: user.username ?? undefined,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    profileImage: user.profileImageUrl ?? undefined,
    isAdmin: user.isAdmin,
    status: user.status,
    totalBetAmount,
    totalBets: bets.length,
    totalWon,
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/leaderboard", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.status, "approved"));

  const result = await Promise.all(
    users.map(async (user) => {
      const bets = await db
        .select()
        .from(betsTable)
        .where(eq(betsTable.userId, user.id));

      let totalBetAmount = 0;
      let totalWon = 0;
      for (const bet of bets) {
        totalBetAmount += parseFloat(bet.amount as string);
        if (bet.status === "won" && bet.payout) {
          totalWon += parseFloat(bet.payout as string);
        }
      }

      const netBalance = totalWon - totalBetAmount;

      return {
        id: user.id,
        username: user.username ?? "Unknown",
        profileImage: user.profileImageUrl ?? undefined,
        totalBetAmount,
        totalWon,
        netBalance,
        totalBets: bets.length,
      };
    })
  );

  const sorted = result.sort((a, b) => b.netBalance - a.netBalance);
  res.json(sorted);
});

router.get("/admin/users", async (req: Request, res: Response) => {
  if (!isAdmin(req, res)) return;

  const users = await db.select().from(usersTable);

  const result = await Promise.all(
    users.map((u) => getUserWithStats(u.id)),
  );

  res.json(result.filter(Boolean));
});

router.patch("/admin/users/:userId/approve", async (req: Request, res: Response) => {
  if (!isAdmin(req, res)) return;

  const parsed = ApproveUserParams.safeParse({ userId: req.params.userId });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(usersTable.id, parsed.data.userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const stats = await getUserWithStats(updated.id);
  res.json(stats);
});

router.patch("/admin/users/:userId/reject", async (req: Request, res: Response) => {
  if (!isAdmin(req, res)) return;

  const parsed = RejectUserParams.safeParse({ userId: req.params.userId });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(usersTable.id, parsed.data.userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const stats = await getUserWithStats(updated.id);
  res.json(stats);
});

router.get("/admin/stats", async (req: Request, res: Response) => {
  if (!isAdmin(req, res)) return;

  const users = await db.select().from(usersTable);
  const matches = await db.select().from(matchesTable);
  const bets = await db.select().from(betsTable);

  const totalUsers = users.length;
  const pendingUsers = users.filter((u) => u.status === "pending").length;
  const totalBetAmount = bets.reduce(
    (acc, bet) => acc + parseFloat(bet.amount as string),
    0,
  );
  const totalMatches = matches.length;
  const activeMatches = matches.filter(
    (m) => m.status === "upcoming" || m.status === "live",
  ).length;

  res.json({
    totalUsers,
    pendingUsers,
    totalBetAmount,
    totalMatches,
    activeMatches,
  });
});

export default router;
