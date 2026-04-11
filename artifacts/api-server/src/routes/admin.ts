import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, betsTable, matchesTable } from "@workspace/db";
import { eq, sum, count, or } from "drizzle-orm";
import { ApproveUserParams, RejectUserParams } from "@workspace/api-zod";

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

  const result = await Promise.all(
    users.map(async (user) => {
      const bets = await db
        .select()
        .from(betsTable)
        .where(eq(betsTable.userId, user.id));

      let totalBetAmount = 0;
      let totalWon = 0;
      let settledBetAmount = 0;
      let wins = 0;
      let losses = 0;
      for (const bet of bets) {
        totalBetAmount += parseFloat(bet.amount as string);
        if (bet.status === "won") {
          settledBetAmount += parseFloat(bet.amount as string);
          if (bet.payout) totalWon += parseFloat(bet.payout as string);
          wins++;
        } else if (bet.status === "lost") {
          settledBetAmount += parseFloat(bet.amount as string);
          losses++;
        }
      }

      const netBalance = totalWon - settledBetAmount;

      return {
        id: user.id,
        username: user.username ?? "Unknown",
        profileImage: user.customAvatarUrl ?? user.profileImageUrl ?? undefined,
        totalBetAmount,
        totalWon,
        netBalance,
        totalBets: bets.length,
        wins,
        losses,
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
        .values({ team1, team2, matchDate })
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

export default router;
