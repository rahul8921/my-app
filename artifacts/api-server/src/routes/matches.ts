import { Router, type IRouter, type Request, type Response } from "express";
import { db, matchesTable, betsTable, usersTable } from "@workspace/db";
import { eq, sum, and } from "drizzle-orm";
import {
  CreateMatchBody,
  SetMatchResultBody,
  SetMatchResultParams,
  GetMatchParams,
} from "@workspace/api-zod";
import { syncMatchesNow } from "../services/cricapi";

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
  // Sync with CricAPI on every request (throttled to once per 2 min internally)
  // await so returned data is always fresh
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

  const [updated] = await db
    .update(matchesTable)
    .set({
      status,
      winner: winner ?? null,
      ...(score !== undefined ? { score } : {}),
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

// ── IPL team name → abbreviation lookup ────────────────────────────────────
const IPL_ABBREV: Record<string, string[]> = {
  CSK:  ["chennai"],
  MI:   ["mumbai"],
  RCB:  ["royal challengers", "bengaluru", "bangalore"],
  KKR:  ["kolkata"],
  SRH:  ["sunrisers", "hyderabad"],
  DC:   ["delhi capitals"],
  PBKS: ["punjab kings", "kings xi"],
  RR:   ["rajasthan"],
  GT:   ["gujarat"],
  LSG:  ["lucknow"],
};

function resolveAbbrev(fullName: string): string | null {
  const lower = fullName.toLowerCase();
  for (const [abbrev, keywords] of Object.entries(IPL_ABBREV)) {
    if (keywords.some(k => lower.includes(k))) return abbrev;
  }
  // direct abbrev match (e.g. "CSK")
  const up = fullName.trim().toUpperCase();
  if (IPL_ABBREV[up]) return up;
  return null;
}

// ── Live score proxy ─────────────────────────────────────────────────────────
// GET /api/scores?team1=CSK&team2=RR
// Calls CRICKET_PROXY_URL/score?team1=CSK&team2=RR and normalises the response
router.get("/scores", async (req: Request, res: Response) => {
  const team1 = (req.query["team1"] as string || "").trim().toUpperCase();
  const team2 = (req.query["team2"] as string || "").trim().toUpperCase();

  if (!team1 || !team2) {
    return res.status(400).json({ error: "team1 and team2 required" });
  }

  const proxyUrl = process.env["CRICKET_PROXY_URL"];
  if (!proxyUrl) {
    return res.json({ found: false, reason: "no_proxy" });
  }

  try {
    const url = `${proxyUrl.replace(/\/$/, "")}/score?team1=${encodeURIComponent(team1)}&team2=${encodeURIComponent(team2)}`;
    console.log(`[scores] → calling: ${url}`);
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) {
      console.log(`[scores] ← proxy HTTP error: ${upstream.status}`);
      return res.json({ found: false, reason: "proxy_error" });
    }

    const data = await upstream.json() as {
      found: boolean;
      status?: string;
      teamScores?: Record<string, { raw: string }>;
    };
    console.log(`[scores] ← raw response:`, JSON.stringify(data));

    if (!data.found || !data.teamScores) {
      return res.json({ found: false, status: data.status ?? "unknown" });
    }

    // Map full team names back to abbreviations
    let team1Score = "";
    let team2Score = "";

    for (const [fullName, scoreObj] of Object.entries(data.teamScores)) {
      const abbrev = resolveAbbrev(fullName);
      if (abbrev === team1) { team1Score = scoreObj.raw; continue; }
      if (abbrev === team2) { team2Score = scoreObj.raw; continue; }
      // fallback: direct string inclusion
      const lower = fullName.toLowerCase();
      if (lower.includes(team1.toLowerCase())) team1Score = scoreObj.raw;
      else if (lower.includes(team2.toLowerCase())) team2Score = scoreObj.raw;
    }

    // Last resort: assign in order if still empty
    if (!team1Score && !team2Score) {
      const vals = Object.values(data.teamScores);
      team1Score = vals[0]?.raw ?? "";
      team2Score = vals[1]?.raw ?? "";
    }

    return res.json({ found: true, status: data.status, team1Score, team2Score });
  } catch (err) {
    return res.json({ found: false, reason: "timeout" });
  }
});

export default router;
