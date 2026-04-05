import { Router, type IRouter, type Request, type Response } from "express";
import { db, matchesTable, betsTable, usersTable } from "@workspace/db";
import { eq, sum, and } from "drizzle-orm";
import {
  CreateMatchBody,
  SetMatchResultBody,
  SetMatchResultParams,
  GetMatchParams,
} from "@workspace/api-zod";
import { syncMatchesNow, cricApiGet } from "../services/cricapi";

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
  // Sync with CricAPI on every page load — settle bets if any match finished
  await syncMatchesNow().catch(() => {});

  const matches = await db.select().from(matchesTable);

  const result = await Promise.all(
    matches.map(async (match) => {
      const betsWithUsers = await db
        .select({
          team: betsTable.team,
          amount: betsTable.amount,
          username: usersTable.username,
          profileImageUrl: usersTable.profileImageUrl,
        })
        .from(betsTable)
        .innerJoin(usersTable, eq(betsTable.userId, usersTable.id))
        .where(eq(betsTable.matchId, match.id));

      let totalBetsTeam1 = 0;
      let totalBetsTeam2 = 0;
      for (const b of betsWithUsers) {
        const amt = parseFloat(b.amount as string);
        if (b.team === match.team1) totalBetsTeam1 += amt;
        else if (b.team === match.team2) totalBetsTeam2 += amt;
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
        bets: betsWithUsers.map(b => ({
          username: b.username ?? "Unknown",
          profileImage: b.profileImageUrl ?? null,
          team: b.team,
          amount: parseFloat(b.amount as string),
        })),
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

router.patch("/matches/:matchId", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.user.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const matchId = parseInt(req.params.matchId);
  if (isNaN(matchId)) {
    res.status(400).json({ error: "Invalid match id" });
    return;
  }

  const { team1, team2, matchDate } = req.body as {
    team1?: string;
    team2?: string;
    matchDate?: string;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (team1) updates.team1 = team1;
  if (team2) updates.team2 = team2;
  if (matchDate) {
    const parsed = new Date(matchDate);
    if (isNaN(parsed.getTime())) {
      res.status(400).json({ error: "Invalid matchDate format" });
      return;
    }
    updates.matchDate = parsed;
  }

  const [updated] = await db
    .update(matchesTable)
    .set(updates as never)
    .where(eq(matchesTable.id, matchId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  res.json({
    id: updated.id,
    team1: updated.team1,
    team2: updated.team2,
    matchDate: updated.matchDate.toISOString(),
    status: updated.status,
    winner: updated.winner,
    createdAt: updated.createdAt.toISOString(),
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
  // score is an optional extra field not in the generated schema
  const score = typeof req.body.score === "string" && req.body.score.trim()
    ? req.body.score.trim()
    : undefined;

  const [existing] = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.id, matchId));

  if (!existing) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  // When admin manually overrides result on a finished match:
  // Clear the old cached JSON score so stale "result" text is replaced.
  // If admin provided a new score string explicitly, use that instead.
  let scoreUpdate: string | null | undefined;
  if (score !== undefined) {
    scoreUpdate = score; // explicit new score from admin
  } else if (status === "finished" && existing.status === "finished") {
    // Re-settling a finished match without new score — clear stale JSON
    scoreUpdate = null;
  }

  const [updated] = await db
    .update(matchesTable)
    .set({
      status,
      winner: winner ?? null,
      ...(scoreUpdate !== undefined ? { score: scoreUpdate } : {}),
      updatedAt: new Date(),
    })
    .where(eq(matchesTable.id, matchId))
    .returning();

  // If match is finished, settle (or re-settle) bets
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

// ── Live score via CricAPI (cricScore endpoint) ───────────────────────────────
// GET /api/scores?matchId=3
// Reads the score stored in DB by syncMatchesNow — zero extra CricAPI calls.
// syncMatchesNow (called on every /api/matches request) keeps the score fresh.
router.get("/scores", async (req: Request, res: Response) => {
  const matchId = req.query["matchId"] ? Number(req.query["matchId"]) : null;
  if (!matchId) return res.status(400).json({ error: "matchId required" });

  const [dbMatch] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  if (!dbMatch) return res.status(404).json({ error: "match not found" });

  if (!dbMatch.score) {
    return res.json({ found: false, reason: "no_score_yet" });
  }

  try {
    const saved = JSON.parse(dbMatch.score) as { team1Score?: string; team2Score?: string; result?: string };
    const isFinished = dbMatch.status === "finished";
    return res.json({
      found: true,
      status: isFinished ? "completed" : "live",
      team1Score: saved.team1Score ?? "",
      team2Score: saved.team2Score ?? "",
      result: saved.result ?? "",
    });
  } catch {
    // Plain-text score (legacy format)
    return res.json({ found: true, status: dbMatch.status, team1Score: dbMatch.score, team2Score: "", result: "" });
  }
});

// ── Live scorecard: batting + bowling details ────────────────────────────────
// GET /api/scorecard?matchId=3
// Returns current batsmen (not out) and current bowler for live matches.
router.get("/scorecard", async (req: Request, res: Response) => {
  const matchId = req.query["matchId"] ? Number(req.query["matchId"]) : null;
  if (!matchId) return res.status(400).json({ error: "matchId required" });

  const [dbMatch] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  if (!dbMatch) return res.status(404).json({ error: "match not found" });

  const cricId = dbMatch.cricapiMatchId;
  if (!cricId) {
    console.log(`[scorecard] no cricapi_match_id stored for match ${matchId}`);
    return res.json({ found: false, reason: "no_match_id" });
  }

  try {
    console.log(`[scorecard] → calling match_score for match ${matchId} (cricId=${cricId})`);
    const result = await cricApiGet("match_score", { id: cricId });
    if (!result) {
      console.log(`[scorecard] ← all API keys exhausted`);
      return res.json({ found: false, reason: "api_failure" });
    }

    type ScorecardData = {
      id: string; name: string; status: string;
      score?: Array<{ r: number; w: number; o: number; inning: string }>;
      scorecard?: Array<{
        inning: string;
        batting: Array<{ batsman: string; "dismissal-text"?: string; r: number; b: number; "4s": number; "6s": number; sr: string | number }>;
        bowling: Array<{ bowler: string; o: string | number; m: number; r: number; w: number; eco: string | number }>;
      }>;
    };
    const match = result.data as ScorecardData;
    const innings = match.scorecard ?? [];

    // Current innings = last one in the scorecard (most recent)
    const currentInnings = innings[innings.length - 1];
    if (!currentInnings) {
      return res.json({ found: true, innings: [], status: match.status });
    }

    // Current batsmen = those not yet dismissed (empty dismissal text)
    const currentBatsmen = (currentInnings.batting ?? [])
      .filter(b => !b["dismissal-text"] || b["dismissal-text"].trim() === "")
      .map(b => ({
        name: b.batsman,
        runs: b.r,
        balls: b.b,
        fours: b["4s"],
        sixes: b["6s"],
        sr: Number(b.sr).toFixed(1),
      }));

    // Current bowler = last bowler with partial (non-integer) overs, or last bowler overall
    const bowlingList = currentInnings.bowling ?? [];
    const currentBowler = (() => {
      // Find the bowler with a fractional over (currently bowling)
      const partial = bowlingList.slice().reverse().find(b => {
        const o = String(b.o);
        return o.includes(".") && !o.endsWith(".0");
      });
      const last = partial ?? bowlingList[bowlingList.length - 1];
      if (!last) return null;
      return {
        name: last.bowler,
        overs: String(last.o),
        runs: last.r,
        wickets: last.w,
        economy: Number(last.eco).toFixed(1),
      };
    })();

    // Build innings summary for all innings (for score display)
    const inningsSummary = (match.score ?? []).map(s => ({
      inning: s.inning,
      runs: s.r,
      wickets: s.w,
      overs: s.o,
    }));

    console.log(`[scorecard] ← batsmen=${currentBatsmen.length} bowler=${currentBowler?.name ?? "none"}`);

    return res.json({
      found: true,
      matchStatus: match.status,
      currentInnings: currentInnings.inning,
      batsmen: currentBatsmen,
      bowler: currentBowler,
      inningsSummary,
    });
  } catch (err) {
    console.error("[scorecard] error:", err);
    return res.json({ found: false, reason: "timeout" });
  }
});

export default router;

