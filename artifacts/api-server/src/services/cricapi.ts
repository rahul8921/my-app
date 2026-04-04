import { db, matchesTable, betsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";

const CRICAPI_BASE = "https://api.cricapi.com/v1";

// IPL 2026 series ID on CricAPI
const IPL_2026_SERIES_ID = "87c62aac-bc3c-4738-ab93-19da0690488f";

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
  venue?: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  score?: CricApiScore[];
  matchStarted?: boolean;
  matchEnded?: boolean;
}

// ── Series match list cache ──────────────────────────────────────────────────
// Cached list of all IPL 2026 matches from series_info
let seriesMatchCache: CricApiMatch[] = [];
let seriesCacheTime = 0;
const SERIES_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function fetchSeriesMatches(apiKey: string): Promise<CricApiMatch[]> {
  const now = Date.now();
  if (seriesMatchCache.length > 0 && now - seriesCacheTime < SERIES_CACHE_TTL) {
    return seriesMatchCache;
  }

  const url = `${CRICAPI_BASE}/series_info?apikey=${apiKey}&id=${IPL_2026_SERIES_ID}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CricAPI series_info HTTP ${res.status}`);
  const data = await res.json() as { status: string; data?: { matchList?: CricApiMatch[] } };
  if (data.status !== "success" || !data.data) throw new Error("CricAPI series_info failed");

  seriesMatchCache = data.data.matchList ?? [];
  seriesCacheTime = now;
  logger.info({ count: seriesMatchCache.length }, "CricAPI: loaded IPL 2026 series match list");
  return seriesMatchCache;
}

// ── Individual match info ────────────────────────────────────────────────────
async function fetchMatchInfo(apiKey: string, matchId: string): Promise<CricApiMatch | null> {
  try {
    const url = `${CRICAPI_BASE}/match_info?apikey=${apiKey}&id=${matchId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as { status: string; data?: CricApiMatch };
    if (data.status !== "success" || !data.data) return null;
    return data.data;
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Local proxy (user's machine) ─────────────────────────────────────────────
interface ProxyResult {
  found: boolean;
  status?: string;
  winner?: string;
  result?: string;
  scores?: string[];
  source?: string;
}

async function fetchFromLocalProxy(team1: string, team2: string): Promise<ProxyResult | null> {
  const proxyUrl = process.env["CRICKET_PROXY_URL"];
  if (!proxyUrl) return null;
  try {
    const url = `${proxyUrl.replace(/\/$/, "")}/score?team1=${encodeURIComponent(team1)}&team2=${encodeURIComponent(team2)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as ProxyResult;
    if (!data.found) return null;
    logger.info({ team1, team2, data }, "LocalProxy: got score from local machine");
    return data;
  } catch (err) {
    logger.warn({ err }, "LocalProxy: request failed, falling back to CricAPI");
    return null;
  }
}

export async function syncMatchesNow(): Promise<void> {
  const apiKey = process.env["CRICAPI_KEY"];
  if (!apiKey) {
    logger.warn("CRICAPI_KEY not set — skipping CricAPI sync");
    return;
  }

  try {
    logger.info("CricAPI: syncing match results via series_info + match_info…");

    // Step 1: Get all IPL 2026 match IDs from series_info (cached 6h)
    const seriesMatches = await fetchSeriesMatches(apiKey);

    // Step 2: Get active DB matches
    const dbMatches = await db
      .select()
      .from(matchesTable)
      .where(or(eq(matchesTable.status, "upcoming"), eq(matchesTable.status, "live")));

    if (dbMatches.length === 0) {
      logger.info("CricAPI: no active matches to sync");
      return;
    }

    // Step 3: For each DB match, find corresponding CricAPI match ID
    let updated = 0;
    for (const dbMatch of dbMatches) {
      const matchTimestamp = new Date(dbMatch.matchDate).getTime();

      // Find best matching series match (by teams + date within 48h)
      const seriesMatch = seriesMatches.find(sm => {
        if (!sm.teams || sm.teams.length < 2) return false;
        const apiTs = new Date(sm.dateTimeGMT || sm.date).getTime();
        if (Math.abs(matchTimestamp - apiTs) > 48 * 60 * 60 * 1000) return false;
        return (
          (teamNamesMatch(dbMatch.team1, sm.teams[0]) && teamNamesMatch(dbMatch.team2, sm.teams[1])) ||
          (teamNamesMatch(dbMatch.team1, sm.teams[1]) && teamNamesMatch(dbMatch.team2, sm.teams[0]))
        );
      });

      if (!seriesMatch) {
        logger.debug(`CricAPI: no series match found for ${dbMatch.team1} vs ${dbMatch.team2}`);
        continue;
      }

      // Step 4a: Try local proxy first (user's machine, residential IP)
      const proxyResult = await fetchFromLocalProxy(dbMatch.team1, dbMatch.team2);

      const updates: Record<string, unknown> = {};

      if (proxyResult && proxyResult.status === "finished" && proxyResult.winner) {
        // Proxy gave us a definitive result — use it
        updates["status"] = "finished";
        updates["winner"] = proxyResult.winner;
        if (proxyResult.result) updates["score"] = proxyResult.result;
        else if (proxyResult.scores && proxyResult.scores.length > 0)
          updates["score"] = proxyResult.scores.join("  •  ");

        if (dbMatch.winner !== proxyResult.winner) {
          await settleMatchBets(dbMatch.id, proxyResult.winner);
        }
      } else {
        // Step 4b: Fall back to CricAPI match_info
        const matchInfo = await fetchMatchInfo(apiKey, seriesMatch.id);
        const apiMatch = matchInfo ?? seriesMatch;

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
          if (!scoreStr && apiMatch.status && apiMatch.status.toLowerCase().includes("won")) {
            updates["score"] = apiMatch.status;
          }
        } else if (proxyResult?.status === "live" || apiMatch.matchStarted) {
          updates["status"] = "live";
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.update(matchesTable)
          .set(updates as never)
          .where(eq(matchesTable.id, dbMatch.id));
        logger.info(
          `CricAPI: updated match ${dbMatch.id} (${dbMatch.team1} vs ${dbMatch.team2}) → ${JSON.stringify(updates)}`
        );
        updated++;
      } else {
        logger.debug(`CricAPI: no changes for ${dbMatch.team1} vs ${dbMatch.team2} (matchEnded=${apiMatch.matchEnded}, status="${apiMatch.status}")`);
      }
    }

    logger.info(`CricAPI: sync complete — ${updated}/${dbMatches.length} match(es) updated`);
  } catch (err) {
    logger.error({ err }, "CricAPI: sync failed");
  }
}
