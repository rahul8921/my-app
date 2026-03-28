import { db, matchesTable, betsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";

const CRICAPI_BASE = "https://api.cricapi.com/v1";

const IPL_KEYWORDS: Record<string, string[]> = {
  RCB: ["royal challengers", "rcb", "bengaluru", "bangalore"],
  SRH: ["sunrisers", "srh", "hyderabad"],
  MI:  ["mumbai indians", "mumbai", " mi "],
  CSK: ["chennai super kings", "chennai", "csk"],
  KKR: ["kolkata knight riders", "kolkata", "kkr"],
  PBKS: ["punjab kings", "punjab", "pbks", "kings xi"],
  RR:  ["rajasthan royals", "rajasthan", " rr "],
  DC:  ["delhi capitals", "delhi", " dc "],
  GT:  ["gujarat titans", "gujarat", " gt "],
  LSG: ["lucknow super giants", "lucknow", "lsg"],
};

function resolveKey(name: string): string | null {
  const lower = ` ${name.toLowerCase()} `;
  for (const [key, keywords] of Object.entries(IPL_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return key;
  }
  return null;
}

function teamNamesMatch(dbTeam: string, apiTeam: string): boolean {
  const dbLower = dbTeam.toLowerCase().trim();
  const apiLower = apiTeam.toLowerCase().trim();
  if (apiLower.includes(dbLower) || dbLower.includes(apiLower)) return true;
  const dbKey = resolveKey(dbTeam);
  const apiKey = resolveKey(apiTeam);
  if (dbKey && apiKey && dbKey === apiKey) return true;
  return false;
}

interface CricApiScore {
  r: number;
  w: number;
  o: number;
  inning: string;
}

interface CricApiMatch {
  id: string;
  name: string;
  matchType: string;
  status: string;
  venue: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  score?: CricApiScore[];
  matchStarted?: boolean;
  matchEnded?: boolean;
}

async function fetchCurrentMatches(apiKey: string): Promise<CricApiMatch[]> {
  const url = `${CRICAPI_BASE}/currentMatches?apikey=${apiKey}&offset=0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CricAPI HTTP ${res.status}`);
  const data = await res.json() as { status: string; data?: CricApiMatch[] };
  if (data.status !== "success") throw new Error(`CricAPI status: ${data.status}`);
  return data.data ?? [];
}

function buildScoreString(scores: CricApiScore[] | undefined): string {
  if (!scores || scores.length === 0) return "";
  return scores
    .map(s => {
      const team = s.inning.split(" Inning")[0].trim();
      return `${team}: ${s.r}/${s.w} (${s.o})`;
    })
    .join("  •  ");
}

function extractWinner(statusText: string, teams: string[]): string | null {
  const lower = statusText.toLowerCase();
  if (!lower.includes("won")) return null;
  for (const team of teams) {
    if (lower.includes(team.toLowerCase())) return team;
  }
  return null;
}

async function settleMatchBets(matchId: number, winner: string): Promise<void> {
  const allBets = await db.select().from(betsTable).where(eq(betsTable.matchId, matchId));
  const pending = allBets.filter(b => b.status === "pending");
  if (pending.length === 0) return;

  const totalPool = pending.reduce((s, b) => s + parseFloat(b.amount as string), 0);
  const winnerPool = pending
    .filter(b => b.team === winner)
    .reduce((s, b) => s + parseFloat(b.amount as string), 0);

  for (const bet of pending) {
    if (bet.team === winner) {
      const payout = winnerPool > 0 ? (parseFloat(bet.amount as string) / winnerPool) * totalPool : 0;
      await db.update(betsTable)
        .set({ status: "won", payout: payout.toFixed(2) })
        .where(eq(betsTable.id, bet.id));
    } else {
      await db.update(betsTable)
        .set({ status: "lost", payout: "0" })
        .where(eq(betsTable.id, bet.id));
    }
  }

  logger.info(`CricAPI: settled ${pending.length} bets for match ${matchId} — winner: ${winner}`);
}

// In-memory throttle: only call CricAPI at most once every 2 minutes
let lastPollTime = 0;
const POLL_COOLDOWN_MS = 2 * 60 * 1000;

export async function syncMatchesNow(force = false): Promise<void> {
  const apiKey = process.env["CRICAPI_KEY"];
  if (!apiKey) {
    logger.warn("CRICAPI_KEY not set — skipping CricAPI sync");
    return;
  }

  const now = Date.now();
  if (!force && now - lastPollTime < POLL_COOLDOWN_MS) {
    logger.debug(`CricAPI: sync skipped (last sync was ${Math.round((now - lastPollTime) / 1000)}s ago)`);
    return;
  }
  lastPollTime = now;

  try {
    logger.info("CricAPI: syncing match results…");
    const apiMatches = await fetchCurrentMatches(apiKey);

    // Sync all non-finished matches (upcoming + live), plus any finished ones that haven't been settled
    const dbMatches = await db
      .select()
      .from(matchesTable)
      .where(or(eq(matchesTable.status, "upcoming"), eq(matchesTable.status, "live")));

    let updated = 0;

    for (const dbMatch of dbMatches) {
      const matchTimestamp = new Date(dbMatch.matchDate).getTime();

      const apiMatch = apiMatches.find(am => {
        if (!am.teams || am.teams.length < 2) return false;
        const apiTimestamp = new Date(am.dateTimeGMT || am.date).getTime();
        if (Math.abs(matchTimestamp - apiTimestamp) > 36 * 60 * 60 * 1000) return false;
        return (
          (teamNamesMatch(dbMatch.team1, am.teams[0]) && teamNamesMatch(dbMatch.team2, am.teams[1])) ||
          (teamNamesMatch(dbMatch.team1, am.teams[1]) && teamNamesMatch(dbMatch.team2, am.teams[0]))
        );
      });

      if (!apiMatch) continue;

      const updates: Record<string, unknown> = {};

      const scoreStr = buildScoreString(apiMatch.score);
      if (scoreStr) updates["score"] = scoreStr;

      if (apiMatch.matchEnded) {
        updates["status"] = "finished";
        const apiWinner = extractWinner(apiMatch.status, apiMatch.teams);
        if (apiWinner) {
          const dbWinner = teamNamesMatch(dbMatch.team1, apiWinner) ? dbMatch.team1 : dbMatch.team2;
          updates["winner"] = dbWinner;
          if (dbMatch.winner !== dbWinner) {
            await settleMatchBets(dbMatch.id, dbWinner);
          }
        }
        // Store the result text as score for completed matches if no score data
        if (!scoreStr && apiMatch.status) {
          updates["score"] = apiMatch.status;
        }
      } else if (apiMatch.matchStarted) {
        updates["status"] = "live";
      }

      if (Object.keys(updates).length > 0) {
        await db.update(matchesTable)
          .set(updates as never)
          .where(eq(matchesTable.id, dbMatch.id));
        logger.info(
          `CricAPI: updated match ${dbMatch.id} (${dbMatch.team1} vs ${dbMatch.team2}) → ${JSON.stringify(updates)}`
        );
        updated++;
      }
    }

    logger.info(`CricAPI: sync complete — ${updated} match(es) updated out of ${dbMatches.length} tracked`);
  } catch (err) {
    logger.error({ err }, "CricAPI: sync failed");
  }
}
