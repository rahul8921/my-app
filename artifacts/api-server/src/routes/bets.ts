import { Router, type IRouter, type Request, type Response } from "express";
import { db, betsTable, matchesTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { PlaceBetBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/bets", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const bets = await db
    .select()
    .from(betsTable)
    .where(eq(betsTable.userId, req.user.id));

  const result = await Promise.all(
    bets.map(async (bet) => {
      const [match] = await db
        .select()
        .from(matchesTable)
        .where(eq(matchesTable.id, bet.matchId));

      // Get totals for the match
      const allBets = await db
        .select()
        .from(betsTable)
        .where(eq(betsTable.matchId, bet.matchId));

      let totalBetsTeam1 = 0;
      let totalBetsTeam2 = 0;
      for (const b of allBets) {
        const amt = parseFloat(b.amount as string);
        if (b.team === match?.team1) totalBetsTeam1 += amt;
        else if (b.team === match?.team2) totalBetsTeam2 += amt;
      }

      return {
        id: bet.id,
        matchId: bet.matchId,
        userId: bet.userId,
        team: bet.team,
        amount: parseFloat(bet.amount as string),
        payout: bet.payout ? parseFloat(bet.payout as string) : null,
        status: bet.status,
        createdAt: bet.createdAt.toISOString(),
        match: match
          ? {
              id: match.id,
              team1: match.team1,
              team2: match.team2,
              matchDate: match.matchDate.toISOString(),
              status: match.status,
              winner: match.winner,
              totalBetsTeam1,
              totalBetsTeam2,
              createdAt: match.createdAt.toISOString(),
            }
          : null,
      };
    }),
  );

  res.json(result);
});

router.post("/bets", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Check if user is approved
  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!dbUser || dbUser.status !== "approved") {
    res.status(403).json({ error: "Your account must be approved to place bets" });
    return;
  }

  const parsed = PlaceBetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid bet data" });
    return;
  }

  const { matchId, team, amount } = parsed.data;

  // Check match exists and is open
  const [match] = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.id, matchId));

  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  const lockTime = new Date(match.matchDate.getTime() - 30 * 60 * 1000);
  if (new Date() >= lockTime || match.status !== "upcoming") {
    res.status(400).json({ error: "Betting is locked — closes 30 minutes before match start" });
    return;
  }

  if (team !== match.team1 && team !== match.team2) {
    res.status(400).json({ error: "Invalid team for this match" });
    return;
  }

  // Check if user already bet on this match
  const [existingBet] = await db
    .select()
    .from(betsTable)
    .where(and(eq(betsTable.matchId, matchId), eq(betsTable.userId, req.user.id)));

  if (existingBet) {
    res.status(400).json({ error: "You have already placed a bet on this match" });
    return;
  }

  const [bet] = await db
    .insert(betsTable)
    .values({
      matchId,
      userId: req.user.id,
      team,
      amount: amount.toString(),
    })
    .returning();

  // Build response with match info
  const allBets = await db
    .select()
    .from(betsTable)
    .where(eq(betsTable.matchId, matchId));

  let totalBetsTeam1 = 0;
  let totalBetsTeam2 = 0;
  for (const b of allBets) {
    const amt = parseFloat(b.amount as string);
    if (b.team === match.team1) totalBetsTeam1 += amt;
    else if (b.team === match.team2) totalBetsTeam2 += amt;
  }

  res.status(201).json({
    id: bet.id,
    matchId: bet.matchId,
    userId: bet.userId,
    team: bet.team,
    amount: parseFloat(bet.amount as string),
    payout: null,
    status: bet.status,
    createdAt: bet.createdAt.toISOString(),
    match: {
      id: match.id,
      team1: match.team1,
      team2: match.team2,
      matchDate: match.matchDate.toISOString(),
      status: match.status,
      winner: match.winner,
      totalBetsTeam1,
      totalBetsTeam2,
      createdAt: match.createdAt.toISOString(),
    },
  });
});

router.patch("/bets/:betId", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const betId = parseInt(req.params.betId);
  if (isNaN(betId)) {
    res.status(400).json({ error: "Invalid bet id" });
    return;
  }

  const [bet] = await db
    .select()
    .from(betsTable)
    .where(and(eq(betsTable.id, betId), eq(betsTable.userId, req.user.id)));

  if (!bet) {
    res.status(404).json({ error: "Bet not found" });
    return;
  }

  const [match] = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.id, bet.matchId));

  const lockTimeEdit = new Date(match.matchDate.getTime() - 30 * 60 * 1000);
  if (!match || new Date() >= lockTimeEdit || match.status !== "upcoming") {
    res.status(400).json({ error: "Betting is locked — closes 30 minutes before match start" });
    return;
  }

  const { amount, team } = req.body as { amount?: number; team?: string };

  if (!amount && !team) {
    res.status(400).json({ error: "Provide amount or team to update" });
    return;
  }

  if (team && team !== match.team1 && team !== match.team2) {
    res.status(400).json({ error: "Invalid team for this match" });
    return;
  }

  if (amount !== undefined && (typeof amount !== "number" || amount !== 10)) {
    res.status(400).json({ error: "Bet amount must be exactly $10" });
    return;
  }

  const updates: Partial<typeof betsTable.$inferInsert> = {};
  if (team) updates.team = team;
  if (amount) updates.amount = amount.toString();

  const [updated] = await db
    .update(betsTable)
    .set(updates)
    .where(eq(betsTable.id, betId))
    .returning();

  res.json({
    id: updated.id,
    matchId: updated.matchId,
    userId: updated.userId,
    team: updated.team,
    amount: parseFloat(updated.amount as string),
    payout: updated.payout ? parseFloat(updated.payout as string) : null,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/bets/:betId", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const betId = parseInt(req.params.betId);
  if (isNaN(betId)) {
    res.status(400).json({ error: "Invalid bet id" });
    return;
  }

  const [bet] = await db
    .select()
    .from(betsTable)
    .where(and(eq(betsTable.id, betId), eq(betsTable.userId, req.user.id)));

  if (!bet) {
    res.status(404).json({ error: "Bet not found" });
    return;
  }

  const [match] = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.id, bet.matchId));

  const lockTimeCancel = new Date(match.matchDate.getTime() - 30 * 60 * 1000);
  if (!match || new Date() >= lockTimeCancel || match.status !== "upcoming") {
    res.status(400).json({ error: "Betting is locked — closes 30 minutes before match start" });
    return;
  }

  await db.delete(betsTable).where(eq(betsTable.id, betId));

  res.json({ success: true });
});

export default router;
