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

// ── CricScore live match type ─────────────────────────────────────────────────
interface CricScoreEntry {
  t1: string;   // e.g. "Chennai Super Kings [CSK]"
  t2: string;
  t1s?: string; // score string
  t2s?: string;
  ms: string;   // "fixture" | "live" | "result"
  status?: string; // result text e.g. "CSK won by 8 wkts"
}

/** Pull team name + abbreviation out of a CricAPI team string like "CSK [CSK]" */
function parseCricApiTeam(raw: string): { name: string; abbr: string } {
  const abbr = (raw.match(/\[(.*?)\]/) ?? [])[1] ?? "";
  const name = raw.replace(/\[.*?\]/g, "").trim();
  return { name, abbr };
}

/** Find a cricScore entry matching two DB team names */
function findCricScoreEntry(
  entries: CricScoreEntry[],
  dbTeam1: string,
  dbTeam2: string,
): CricScoreEntry | undefined {
  return entries.find(e => {
    const { name: n1, abbr: a1 } = parseCricApiTeam(e.t1);
    const { name: n2, abbr: a2 } = parseCricApiTeam(e.t2);
    const fwd = (teamNamesMatch(dbTeam1, n1) || teamNamesMatch(dbTeam1, a1)) &&
                (teamNamesMatch(dbTeam2, n2) || teamNamesMatch(dbTeam2, a2));
    const rev = (teamNamesMatch(dbTeam1, n2) || teamNamesMatch(dbTeam1, a2)) &&
                (teamNamesMatch(dbTeam2, n1) || teamNamesMatch(dbTeam2, a1));
    return fwd || rev;
  });
}

/** Determine which DB team won from a result status string */
function resolveWinner(statusText: string, dbTeam1: string, dbTeam2: string): string | null {
  const lower = statusText.toLowerCase();
  if (!lower.includes("won")) return null;
  // Check full name match
  if (lower.includes(dbTeam1.toLowerCase())) return dbTeam1;
  if (lower.includes(dbTeam2.toLowerCase())) return dbTeam2;
  // Check abbreviation match
  const k1 = resolveKey(dbTeam1);
  const k2 = resolveKey(dbTeam2);
  if (k1 && lower.includes(k1.toLowerCase())) return dbTeam1;
  if (k2 && lower.includes(k2.toLowerCase())) return dbTeam2;
  return null;
}

export async function syncMatchesNow(): Promise<void> {
  const apiKey = process.env["CRICAPI_KEY"];
  if (!apiKey) {
    logger.warn("CRICAPI_KEY not set — skipping CricAPI sync");
    return;
  }

  const now = Date.now();

  // ── Quick DB check before touching the API ───────────────────────────────
  // Fetch all upcoming/live DB matches to see if any have actually started
  const dbMatches = await db
    .select()
    .from(matchesTable)
    .where(or(eq(matchesTable.status, "upcoming"), eq(matchesTable.status, "live")));

  if (dbMatches.length === 0) {
    return; // nothing to watch
  }

  // Only proceed if at least one match is past its scheduled start time (5-min grace)
  const pastMatches = dbMatches.filter(
    m => new Date(m.matchDate).getTime() < now - 5 * 60 * 1000,
  );

  if (pastMatches.length === 0) {
    return; // all matches are still in the future — no CricAPI call needed
  }

  try {
    logger.info(`CricAPI: syncing ${pastMatches.length} past-scheduled match(es)…`);

    // ── Step 1: cricScore — real-time live/result status for ALL ongoing matches ──
    let cricScoreEntries: CricScoreEntry[] = [];
    try {
      const res = await fetch(`${CRICAPI_BASE}/cricScore?apikey=${apiKey}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json() as { data?: CricScoreEntry[] };
        cricScoreEntries = data.data ?? [];
        logger.info(`CricAPI: cricScore returned ${cricScoreEntries.length} live entries`);
      }
    } catch (err) {
      logger.warn({ err }, "CricAPI: cricScore call failed, will fall back to match_info");
    }

    // ── Step 2: series_info — for match IDs (cached 6 h) ──────────────────────
    let seriesMatches: CricApiMatch[] = [];
    try {
      seriesMatches = await fetchSeriesMatches(apiKey);
    } catch (err) {
      logger.warn({ err }, "CricAPI: series_info failed, will skip match_info fallback");
    }

    let updated = 0;

    for (const dbMatch of pastMatches) {
      const updates: Record<string, unknown> = {};

      // ── Try cricScore first ──────────────────────────────────────────────────
      const liveEntry = findCricScoreEntry(cricScoreEntries, dbMatch.team1, dbMatch.team2);

      if (liveEntry) {
        logger.info(
          `CricAPI: cricScore found ${dbMatch.team1} vs ${dbMatch.team2}: ms="${liveEntry.ms}"`,
        );

        // Determine team order in the cricScore entry (forward or reversed)
        const { name: n1, abbr: a1 } = parseCricApiTeam(liveEntry.t1);
        const isForward = teamNamesMatch(dbMatch.team1, n1) || teamNamesMatch(dbMatch.team1, a1);
        const team1Score = isForward ? (liveEntry.t1s ?? "") : (liveEntry.t2s ?? "");
        const team2Score = isForward ? (liveEntry.t2s ?? "") : (liveEntry.t1s ?? "");

        if (liveEntry.ms === "live") {
          // Transition upcoming → live
          if (dbMatch.status !== "live") updates["status"] = "live";
          // Always persist the latest live score so /api/scores can read from DB
          if (team1Score || team2Score) {
            updates["score"] = JSON.stringify({ team1Score, team2Score });
          }

        } else if (liveEntry.ms === "result" || liveEntry.ms === "completed") {
          if (dbMatch.status !== "finished") {
            const result = liveEntry.status ?? "";
            updates["status"] = "finished";
            updates["score"] = JSON.stringify({ team1Score, team2Score, result });

            const winner = resolveWinner(result, dbMatch.team1, dbMatch.team2);
            if (winner) {
              updates["winner"] = winner;
              if (dbMatch.winner !== winner) {
                await settleMatchBets(dbMatch.id, winner);
              }
            }
          }
        }
      } else {
        // ── Fallback: series_info + match_info ────────────────────────────────
        const matchTimestamp = new Date(dbMatch.matchDate).getTime();
        const seriesMatch = seriesMatches.find(sm => {
          if (!sm.teams || sm.teams.length < 2) return false;
          const apiTs = new Date(sm.dateTimeGMT || sm.date).getTime();
          if (Math.abs(matchTimestamp - apiTs) > 48 * 60 * 60 * 1000) return false;
          return (
            (teamNamesMatch(dbMatch.team1, sm.teams[0]) && teamNamesMatch(dbMatch.team2, sm.teams[1])) ||
            (teamNamesMatch(dbMatch.team1, sm.teams[1]) && teamNamesMatch(dbMatch.team2, sm.teams[0]))
          );
        });

        if (seriesMatch) {
          // Always store the CricAPI match ID so the scorecard endpoint can use it
          if (!dbMatch.cricapiMatchId) {
            updates["cricapi_match_id"] = seriesMatch.id;
          }

          const matchInfo = await fetchMatchInfo(apiKey, seriesMatch.id);
          const apiMatch = matchInfo ?? seriesMatch;

          const scoreStr = buildScoreString(apiMatch.score);

          if (apiMatch.matchEnded) {
            updates["status"] = "finished";
            if (scoreStr) updates["score"] = scoreStr;
            else if (apiMatch.status?.toLowerCase().includes("won")) updates["score"] = apiMatch.status;

            const apiWinner = extractWinner(apiMatch.status, apiMatch.teams);
            if (apiWinner) {
              const dbWinner = teamNamesMatch(dbMatch.team1, apiWinner) ? dbMatch.team1 : dbMatch.team2;
              updates["winner"] = dbWinner;
              if (dbMatch.winner !== dbWinner) {
                await settleMatchBets(dbMatch.id, dbWinner);
              }
            }
          } else if (apiMatch.matchStarted && dbMatch.status !== "live") {
            updates["status"] = "live";
            if (scoreStr) updates["score"] = scoreStr;
          }
        } else {
          logger.debug(
            `CricAPI: no data found for ${dbMatch.team1} vs ${dbMatch.team2} — not in cricScore or series list`,
          );
        }
      }

      if (Object.keys(updates).length > 0) {
        updates["updatedAt"] = new Date();
        await db.update(matchesTable)
          .set(updates as never)
          .where(eq(matchesTable.id, dbMatch.id));
        logger.info(
          `CricAPI: match ${dbMatch.id} (${dbMatch.team1} vs ${dbMatch.team2}) → ${JSON.stringify(updates)}`,
        );
        updated++;
      }
    }

    logger.info(`CricAPI: sync complete — ${updated}/${pastMatches.length} match(es) updated`);
  } catch (err) {
    logger.error({ err }, "CricAPI: sync failed");
  }
}
