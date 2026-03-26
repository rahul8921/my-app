import { Router, type IRouter, type Request, type Response } from "express";
import { db, matchesTable, betsTable } from "@workspace/db";
import { eq, sum, and } from "drizzle-orm";
import {
  CreateMatchBody,
  SetMatchResultBody,
  SetMatchResultParams,
  GetMatchParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getMatchWithTotals(matchId: number) {
  const [match] = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.id, matchId));

  if (!match) return null;

  const bets = await db.select().from(betsTable).where(eq(betsTable.matchId, matchId));

  let totalBetsTeam1 = 0;
  let totalBetsTeam2 = 0;
  for (const bet of bets) {
    const amt = parseFloat(bet.amount as string);
    if (bet.team === match.team1) totalBetsTeam1 += amt;
    else if (bet.team === match.team2) totalBetsTeam2 += amt;
  }

  return {
    ...match,
    totalBetsTeam1,
    totalBetsTeam2,
  };
}

router.get("/matches", async (req: Request, res: Response) => {
  const matches = await db.select().from(matchesTable);

  const result = await Promise.all(
    matches.map(async (match) => {
      const bets = await db
        .select()
        .from(betsTable)
        .where(eq(betsTable.matchId, match.id));

      let totalBetsTeam1 = 0;
      let totalBetsTeam2 = 0;
      for (const bet of bets) {
        const amt = parseFloat(bet.amount as string);
        if (bet.team === match.team1) totalBetsTeam1 += amt;
        else if (bet.team === match.team2) totalBetsTeam2 += amt;
      }

      return {
        id: match.id,
        team1: match.team1,
        team2: match.team2,
        matchDate: match.matchDate.toISOString(),
        status: match.status,
        winner: match.winner,
        score: match.score ?? null,
        totalBetsTeam1,
        totalBetsTeam2,
        createdAt: match.createdAt.toISOString(),
      };
    }),
  );

  res.json(result);
});

router.get("/matches/:matchId", async (req: Request, res: Response) => {
  const parsed = GetMatchParams.safeParse({ matchId: req.params.matchId });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid match id" });
    return;
  }

  const matchId = parsed.data.matchId;
  const matchData = await getMatchWithTotals(matchId);

  if (!matchData) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  let myBet = null;
  if (req.isAuthenticated()) {
    const [bet] = await db
      .select()
      .from(betsTable)
      .where(and(eq(betsTable.matchId, matchId), eq(betsTable.userId, req.user.id)));
    if (bet) {
      myBet = {
        id: bet.id,
        matchId: bet.matchId,
        userId: bet.userId,
        team: bet.team,
        amount: parseFloat(bet.amount as string),
        payout: bet.payout ? parseFloat(bet.payout as string) : null,
        status: bet.status,
        createdAt: bet.createdAt.toISOString(),
      };
    }
  }

  res.json({
    id: matchData.id,
    team1: matchData.team1,
    team2: matchData.team2,
    matchDate: matchData.matchDate.toISOString(),
    status: matchData.status,
    winner: matchData.winner,
    score: matchData.score ?? null,
    totalBetsTeam1: matchData.totalBetsTeam1,
    totalBetsTeam2: matchData.totalBetsTeam2,
    createdAt: matchData.createdAt.toISOString(),
    myBet,
  });
});

router.post("/matches", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.user.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { team1, team2, matchDate } = req.body as {
    team1?: string;
    team2?: string;
    matchDate?: string;
  };

  if (!team1 || !team2 || !matchDate) {
    res.status(400).json({ error: "team1, team2, and matchDate are required" });
    return;
  }

  const parsedDate = new Date(matchDate);
  if (isNaN(parsedDate.getTime())) {
    res.status(400).json({ error: "Invalid matchDate format" });
    return;
  }

  const [match] = await db
    .insert(matchesTable)
    .values({
      team1,
      team2,
      matchDate: new Date(matchDate as string),
    })
    .returning();

  res.status(201).json({
    id: match.id,
    team1: match.team1,
    team2: match.team2,
    matchDate: match.matchDate.toISOString(),
    status: match.status,
    winner: match.winner,
    totalBetsTeam1: 0,
    totalBetsTeam2: 0,
    createdAt: match.createdAt.toISOString(),
  });
});

router.patch("/matches/:matchId/result", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.user.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const paramsParsed = SetMatchResultParams.safeParse({ matchId: req.params.matchId });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid match id" });
    return;
  }

  const bodyParsed = SetMatchResultBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const matchId = paramsParsed.data.matchId;
  const { winner, status } = bodyParsed.data;

  const [existing] = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.id, matchId));

  if (!existing) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  const [updated] = await db
    .update(matchesTable)
    .set({
      status,
      winner: winner ?? null,
      updatedAt: new Date(),
    })
    .where(eq(matchesTable.id, matchId))
    .returning();

  // If match is finished, settle bets
  if (status === "finished" && winner) {
    const bets = await db
      .select()
      .from(betsTable)
      .where(eq(betsTable.matchId, matchId));

    // Calculate total pools
    let winnerPool = 0;
    let totalPool = 0;
    for (const bet of bets) {
      const amt = parseFloat(bet.amount as string);
      totalPool += amt;
      if (bet.team === winner) winnerPool += amt;
    }

    // Settle each bet
    for (const bet of bets) {
      const amt = parseFloat(bet.amount as string);
      if (bet.team === winner) {
        // Winner gets proportional share of total pool
        const payout = winnerPool > 0 ? (amt / winnerPool) * totalPool : 0;
        await db
          .update(betsTable)
          .set({ status: "won", payout: payout.toFixed(2) })
          .where(eq(betsTable.id, bet.id));
      } else {
        await db
          .update(betsTable)
          .set({ status: "lost", payout: "0" })
          .where(eq(betsTable.id, bet.id));
      }
    }
  }

  const matchData = await getMatchWithTotals(matchId);

  res.json({
    id: updated.id,
    team1: updated.team1,
    team2: updated.team2,
    matchDate: updated.matchDate.toISOString(),
    status: updated.status,
    winner: updated.winner,
    totalBetsTeam1: matchData?.totalBetsTeam1 ?? 0,
    totalBetsTeam2: matchData?.totalBetsTeam2 ?? 0,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
