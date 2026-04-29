import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, betsTable, matchesTable } from "@workspace/db";
import { eq, sum, count, or, and, desc } from "drizzle-orm";
import { ApproveUserParams, RejectUserParams } from "@workspace/api-zod";
import { cricApiGet, syncMatchesNow } from "../services/cricapi";

const CRICAPI_BASE = "https://api.cricapi.com/v1";

const IPL_KEYWORDS: Record<string, string[]> = {
  RCB:  ["royal challengers", "rcb", "bengaluru", "bangalore"],
  SRH:  ["sunrisers", "srh", "hyderabad"],
  MI:   ["mumbai indians", "mumbai", " mi "],
  CSK:  ["chennai super kings", "chennai", "csk"],
  KKR:  ["kolkata knight riders", "kolkata", "kkr"],
  PBKS: ["punjab kings", "punjab", "pbks", "kings xi"],
  RR:   ["rajasthan royals", "rajasthan", " rr "],
  DC:   ["delhi capitals", "delhi", " dc "],
  GT:   ["gujarat titans", "gujarat", " gt "],
  LSG:  ["lucknow super giants", "lucknow", "lsg"],
};

function resolveIplKey(name: string): string | null {
  const lower = ` ${name.toLowerCase()} `;
  for (const [key, keywords] of Object.entries(IPL_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return key;
  }
  return null;
}

function isIplTeam(name: string): boolean {
  return resolveIplKey(name) !== null;
}

function toShortName(fullName: string): string {
  const key = resolveIplKey(fullName);
  return key ?? fullName;
}

interface CricApiMatchItem {
  id: string;
  name: string;
  matchType: string;
  status: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  matchStarted?: boolean;
  matchEnded?: boolean;
}

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
    profileImage: user.customAvatarUrl ?? user.profileImageUrl ?? undefined,
    isAdmin: user.isAdmin,
    status: user.status,
    totalBetAmount,
    totalBets: bets.length,
    totalWon,
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/leaderboard/journey", async (req: Request, res: Response) => {
  // All finished matches sorted by date
  const allMatches = await db.select().from(matchesTable).where(eq(matchesTable.status, "finished"));
  allMatches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());

  // All approved users
  const users = await db.select().from(usersTable).where(eq(usersTable.status, "approved"));

  // All settled bets
  const settledBets = await db.select().from(betsTable).where(
    or(eq(betsTable.status, "won"), eq(betsTable.status, "lost"))
  );

  const userJourneys = users.map((user) => {
    let cumulative = 0;
    const points = allMatches.map((match) => {
      const bet = settledBets.find((b) => b.userId === user.id && b.matchId === match.id);
      if (bet) {
        if (bet.status === "won") {
          cumulative += parseFloat(bet.payout as string) - parseFloat(bet.amount as string);
        } else {
          cumulative -= parseFloat(bet.amount as string);
        }
      }
      return parseFloat(cumulative.toFixed(2));
    });
    return { username: user.username ?? "Unknown", points };
  });

  res.json({
    matchKeys: allMatches.map((_, i) => `M${i + 1}`),
    matchLabels: allMatches.map((m) => `${m.team1} vs ${m.team2}`),
    users: userJourneys,
  });
});

router.get("/leaderboard", async (req: Request, res: Response) => {
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.status, "approved"));

  // Fetch all settled bets for all matches once — used to compute pool totals
  const allBets = await db.select().from(betsTable);
  const allMatches = await db.select().from(matchesTable);

  // Build a map of matchId -> { team1: string, team2: string, team1Pool: number, team2Pool: number }
  const matchPoolMap = new Map<number, { team1: string; team2: string; team1Pool: number; team2Pool: number }>();
  for (const match of allMatches) {
    matchPoolMap.set(match.id, { team1: match.team1, team2: match.team2, team1Pool: 0, team2Pool: 0 });
  }
  for (const bet of allBets) {
    const pool = matchPoolMap.get(bet.matchId);
    if (!pool) continue;
    const amt = parseFloat(bet.amount as string);
    if (bet.team === pool.team1) pool.team1Pool += amt;
    else if (bet.team === pool.team2) pool.team2Pool += amt;
  }

  const result = await Promise.all(
    users.map(async (user) => {
      const bets = allBets.filter(b => b.userId === user.id);

      let totalBetAmount = 0;
      let totalWon = 0;
      let settledBetAmount = 0;
      let wins = 0;
      let losses = 0;
      let bestPayout = 0;
      let biggestBet = 0;
      let biggestLoss = 0;
      // Underdog bets: user bet on the side with less total pool
      let underdogPlayed = 0;
      let underdogWins = 0;
      let underdogLosses = 0;

      for (const bet of bets) {
        const amt = parseFloat(bet.amount as string);
        totalBetAmount += amt;
        if (amt > biggestBet) biggestBet = amt;

        // Check if this was an underdog bet (user's team had smaller pool)
        const pool = matchPoolMap.get(bet.matchId);
        if (pool) {
          const myTeamPool = bet.team === pool.team1 ? pool.team1Pool : pool.team2Pool;
          const otherPool = bet.team === pool.team1 ? pool.team2Pool : pool.team1Pool;
          const isUnderdog = myTeamPool < otherPool && otherPool > 0;
          if (isUnderdog) {
            underdogPlayed++;
            if (bet.status === "won") underdogWins++;
            else if (bet.status === "lost") underdogLosses++;
          }
        }

        if (bet.status === "won") {
          settledBetAmount += amt;
          if (bet.payout) {
            const payout = parseFloat(bet.payout as string);
            totalWon += payout;
            if (payout > bestPayout) bestPayout = payout;
          }
          wins++;
        } else if (bet.status === "lost") {
          settledBetAmount += amt;
          if (amt > biggestLoss) biggestLoss = amt;
          losses++;
        }
      }

      const netBalance = totalWon - settledBetAmount;

      return {
        id: user.id,
        username: user.username ?? "Unknown",
        profileImage: user.customAvatarUrl ?? user.profileImageUrl ?? undefined,
        isAdmin: user.isAdmin,
        totalBetAmount,
        totalWon,
        netBalance,
        totalBets: bets.length,
        wins,
        losses,
        bestPayout,
        biggestBet,
        biggestLoss,
        underdogPlayed,
        underdogWins,
        underdogLosses,
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

router.post("/admin/fix-match-times", async (req: Request, res: Response) => {
  if (!isAdmin(req, res)) return;

  try {
    // Find all matches where UTC hour < 12 (i.e. before noon UTC = before 10 AM ET at EDT UTC-4)
    const allMatches = await db.select().from(matchesTable);
    let fixed = 0;
    for (const match of allMatches) {
      const utcHour = match.matchDate.getUTCHours();
      if (utcHour < 12) {
        // Shift to 14:00 UTC (= 10:00 AM ET during EDT)
        const corrected = new Date(match.matchDate);
        corrected.setUTCHours(14, 0, 0, 0);
        await db.update(matchesTable)
          .set({ matchDate: corrected, updatedAt: new Date() })
          .where(eq(matchesTable.id, match.id));
        fixed++;
      }
    }
    res.json({ fixed, message: `${fixed} match time(s) corrected to 10:00 AM ET` });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to fix match times" });
  }
});

router.post("/admin/import-matches", async (req: Request, res: Response) => {
  if (!isAdmin(req, res)) return;

  const apiKey = process.env["CRICAPI_KEY"];
  if (!apiKey) {
    res.status(503).json({ error: "CRICAPI_KEY not configured on server" });
    return;
  }

  try {
    // Step 1: Find the current IPL series ID by searching the series list
    let iplSeriesId: string | null = null;
    const currentYear = new Date().getFullYear();

    for (const offset of [0, 25, 50, 75]) {
      const seriesResp = await fetch(`${CRICAPI_BASE}/series?apikey=${apiKey}&offset=${offset}`);
      if (!seriesResp.ok) break;
      const seriesData = await seriesResp.json() as { status: string; data?: { id: string; name: string }[] };
      if (seriesData.status !== "success" || !seriesData.data?.length) break;

      const found = seriesData.data.find(s => {
        const n = s.name?.toLowerCase() ?? "";
        return (n.includes("indian premier league") || n.includes("ipl")) && n.includes(String(currentYear));
      });

      if (found) {
        iplSeriesId = found.id;
        break;
      }
    }

    if (!iplSeriesId) {
      res.json({ imported: 0, skipped: 0, matches: [], message: `IPL ${currentYear} series not found in CricAPI yet` });
      return;
    }

    // Step 2: Fetch match list from the IPL series
    const seriesInfoResp = await fetch(`${CRICAPI_BASE}/series_info?apikey=${apiKey}&id=${iplSeriesId}`);
    if (!seriesInfoResp.ok) {
      res.status(502).json({ error: "Failed to fetch IPL series info from CricAPI" });
      return;
    }
    const seriesInfoData = await seriesInfoResp.json() as {
      status: string;
      data?: { info?: { name: string }; matchList?: CricApiMatchItem[] };
    };
    if (seriesInfoData.status !== "success" || !seriesInfoData.data?.matchList) {
      res.json({ imported: 0, skipped: 0, matches: [], message: "No match list in IPL series" });
      return;
    }

    const allApiMatches: CricApiMatchItem[] = seriesInfoData.data.matchList;

    // Filter: only include matches with two known IPL teams that haven't ended
    const iplMatches = allApiMatches.filter(m => {
      if (m.matchEnded) return false;
      if (!m.teams || m.teams.length < 2) return false;
      return isIplTeam(m.teams[0]) && isIplTeam(m.teams[1]);
    });

    // Load existing DB matches to deduplicate
    const existingMatches = await db.select().from(matchesTable);

    const imported: typeof matchesTable.$inferSelect[] = [];
    const skipped: string[] = [];

    for (const apiMatch of iplMatches) {
      const team1 = toShortName(apiMatch.teams[0]);
      const team2 = toShortName(apiMatch.teams[1]);
      const matchDate = new Date(apiMatch.dateTimeGMT || apiMatch.date);

      // Deduplicate: skip if we already have a match with same teams on same day
      const alreadyExists = existingMatches.some(ex => {
        const exDate = new Date(ex.matchDate);
        const sameDay = Math.abs(exDate.getTime() - matchDate.getTime()) < 24 * 60 * 60 * 1000;
        const sameTeams =
          (ex.team1 === team1 && ex.team2 === team2) ||
          (ex.team1 === team2 && ex.team2 === team1);
        return sameDay && sameTeams;
      });

      if (alreadyExists) {
        skipped.push(`${team1} vs ${team2}`);
        continue;
      }

      const [inserted] = await db
        .insert(matchesTable)
        .values({ team1, team2, matchDate, cricapiMatchId: apiMatch.id })
        .returning();

      imported.push(inserted);
      existingMatches.push(inserted); // prevent double-insert within same call
    }

    res.json({
      imported: imported.length,
      skipped: skipped.length,
      matches: imported.map(m => ({
        id: m.id,
        team1: m.team1,
        team2: m.team2,
        matchDate: m.matchDate.toISOString(),
        status: m.status,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to import matches" });
  }
});

// ── Debug: see exactly what CricAPI returns ──────────────────────────────────
router.get("/admin/debug-cricapi", async (req: Request, res: Response) => {
  if (!isAdmin(req, res)) return;

  // What's in DB
  const dbMatches = await db.select().from(matchesTable);
  const active = dbMatches.filter(m => m.status === "upcoming" || m.status === "live");

  // Raw cricScore
  const cricScoreResult = await cricApiGet("cricScore");
  const allEntries = (cricScoreResult?.data as any[]) ?? [];

  // IPL-related entries from cricScore
  const iplEntries = allEntries.filter((e: any) => {
    const t = `${e.t1 ?? ""} ${e.t2 ?? ""}`.toLowerCase();
    return ["csk","mi","rcb","kkr","srh","dc","gt","lsg","pbks","rr",
            "chennai","mumbai","delhi","kolkata","hyderabad","punjab",
            "rajasthan","gujarat","lucknow","royal challengers"].some(kw => t.includes(kw));
  });

  // Force sync and capture result
  await syncMatchesNow(true).catch(() => {});
  const afterSync = await db.select().from(matchesTable);
  const activeAfter = afterSync.filter(m => m.status === "upcoming" || m.status === "live");

  res.json({
    apiKeyConfigured: !!(process.env["CRICAPI_KEY"] || process.env["CRICAPI_KEY_2"]),
    cricScore: {
      success: !!cricScoreResult,
      totalEntries: allEntries.length,
      iplEntries,
    },
    dbMatchesBefore: active.map(m => ({ id: m.id, teams: `${m.team1} vs ${m.team2}`, status: m.status, matchDate: m.matchDate, cricapiMatchId: m.cricapiMatchId })),
    dbMatchesAfter: activeAfter.map(m => ({ id: m.id, teams: `${m.team1} vs ${m.team2}`, status: m.status, matchDate: m.matchDate, cricapiMatchId: m.cricapiMatchId })),
  });
});

// ─── Admin: manage bets on behalf of users ────────────────────────────────────
// v1 scope:
//   - Amount is fixed at $10 (matches user-side constraint), so admin can only
//     create/change the team — not the amount.
//   - Settled bets (won/lost) are read-only.
//   - Same lock rules as user-side: match must be "upcoming" and not within
//     30 minutes of start.

router.get("/admin/all-bets", async (req: Request, res: Response) => {
  if (!isAdmin(req, res)) return;

  const rows = await db
    .select({
      bet: betsTable,
      user: { id: usersTable.id, username: usersTable.username, email: usersTable.email },
      match: matchesTable,
    })
    .from(betsTable)
    .leftJoin(usersTable, eq(betsTable.userId, usersTable.id))
    .leftJoin(matchesTable, eq(betsTable.matchId, matchesTable.id))
    .orderBy(desc(betsTable.createdAt));

  res.json(rows.map(({ bet, user, match }) => ({
    id: bet.id,
    userId: bet.userId,
    user: user ? { id: user.id, username: user.username ?? "Unknown", email: user.email ?? null } : null,
    matchId: bet.matchId,
    match: match ? {
      id: match.id,
      team1: match.team1,
      team2: match.team2,
      matchDate: match.matchDate.toISOString(),
      status: match.status,
      winner: match.winner,
    } : null,
    team: bet.team,
    amount: parseFloat(bet.amount as string),
    payout: bet.payout ? parseFloat(bet.payout as string) : null,
    status: bet.status,
    createdAt: bet.createdAt.toISOString(),
  })));
});

router.post("/admin/bets", async (req: Request, res: Response) => {
  if (!isAdmin(req, res)) return;

  const { userId, matchId, team } = req.body as { userId?: string; matchId?: number; team?: string };
  if (!userId || typeof matchId !== "number" || !team) {
    res.status(400).json({ error: "userId, matchId, team are required" });
    return;
  }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!targetUser) {
    res.status(404).json({ error: "Target user not found" });
    return;
  }
  if (targetUser.status !== "approved") {
    res.status(400).json({ error: "Target user is not approved — approve them first" });
    return;
  }

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
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

  const [existingBet] = await db
    .select()
    .from(betsTable)
    .where(and(eq(betsTable.matchId, matchId), eq(betsTable.userId, userId)));
  if (existingBet) {
    res.status(400).json({ error: "User already has a bet on this match" });
    return;
  }

  const [inserted] = await db
    .insert(betsTable)
    .values({ matchId, userId, team, amount: "10" })
    .returning();

  req.log?.info(
    { adminId: req.user.id, action: "create_bet", betId: inserted.id, targetUserId: userId, matchId, team },
    "[ADMIN BET] created bet on behalf of user",
  );

  res.status(201).json({
    id: inserted.id,
    userId: inserted.userId,
    matchId: inserted.matchId,
    team: inserted.team,
    amount: parseFloat(inserted.amount as string),
    payout: null,
    status: inserted.status,
    createdAt: inserted.createdAt.toISOString(),
  });
});

router.patch("/admin/bets/:betId", async (req: Request, res: Response) => {
  if (!isAdmin(req, res)) return;

  const betId = parseInt(req.params.betId);
  if (isNaN(betId)) {
    res.status(400).json({ error: "Invalid bet id" });
    return;
  }

  const { team } = req.body as { team?: string };
  if (!team) {
    res.status(400).json({ error: "team is required" });
    return;
  }

  const [bet] = await db.select().from(betsTable).where(eq(betsTable.id, betId));
  if (!bet) {
    res.status(404).json({ error: "Bet not found" });
    return;
  }
  if (bet.status !== "pending") {
    res.status(400).json({ error: "Cannot modify a settled bet" });
    return;
  }

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, bet.matchId));
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

  const [updated] = await db
    .update(betsTable)
    .set({ team })
    .where(eq(betsTable.id, betId))
    .returning();

  req.log?.info(
    { adminId: req.user.id, action: "update_bet", betId, oldTeam: bet.team, newTeam: team, targetUserId: bet.userId },
    "[ADMIN BET] updated bet team",
  );

  res.json({
    id: updated.id,
    userId: updated.userId,
    matchId: updated.matchId,
    team: updated.team,
    amount: parseFloat(updated.amount as string),
    payout: updated.payout ? parseFloat(updated.payout as string) : null,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
