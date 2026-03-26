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

  if (match.status === "finished") {
    res.status(400).json({ error: "This match has already finished" });
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

export default router;
