/**
 * cricket-proxy.js  –  Run this on your LOCAL machine, not on Replit.
 *
 * Setup:
 *   1. Run: node cricket-proxy.js
 *   2. In another terminal: ngrok http 3001
 *   3. Copy the ngrok https URL
 *   4. Set CRICKET_PROXY_URL = that URL in Replit Secrets
 *
 * Test: http://localhost:3001/score?team1=SRH&team2=RCB
 */

const http  = require("http");
const https = require("https");
const url   = require("url");

const PORT = 3001;

// ── Simple HTTP GET with redirect support ────────────────────────────────────
function get(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const lib    = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   "GET",
        headers:  {
          "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "identity",
          "Referer":         "https://www.cricbuzz.com/",
          ...headers,
        },
      },
      (res) => {
        if ([301, 302, 303].includes(res.statusCode) && res.headers.location) {
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : `https://www.cricbuzz.com${res.headers.location}`;
          console.log(`  ↳ redirect → ${next}`);
          return get(next, headers).then(resolve).catch(reject);
        }
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on("error", reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

// ── Team keyword map ─────────────────────────────────────────────────────────
const TEAMS = {
  RCB:  ["royal challengers", "rcb", "bengaluru", "bangalore"],
  SRH:  ["sunrisers", "srh", "hyderabad"],
  MI:   ["mumbai indians", "mumbai"],
  CSK:  ["chennai super kings", "chennai", "csk"],
  KKR:  ["kolkata knight riders", "kolkata", "kkr"],
  PBKS: ["punjab kings", "punjab", "pbks"],
  RR:   ["rajasthan royals", "rajasthan"],
  DC:   ["delhi capitals", "delhi"],
  GT:   ["gujarat titans", "gujarat"],
  LSG:  ["lucknow super giants", "lucknow", "lsg"],
};

function resolveTeamCode(text) {
  const lower = text.toLowerCase();
  for (const [code, kws] of Object.entries(TEAMS)) {
    if (kws.some((k) => lower.includes(k))) return code;
  }
  return null;
}

function slugContainsTeam(slug, teamCode) {
  const lower = slug.toLowerCase();
  return (TEAMS[teamCode] || [teamCode.toLowerCase()]).some((k) => lower.includes(k.split(" ")[0]));
}

// ── Parse a match page for result ────────────────────────────────────────────
function parseMatchPage(html, team1Code, team2Code) {
  // Scores — e.g. "183/4 (20 Ovs)"
  const scoreRe = /(\d{2,3}\/\d{1,2})\s*\([\d.]+\s*Ov/gi;
  const rawScores = [];
  let sm;
  while ((sm = scoreRe.exec(html)) !== null) rawScores.push(sm[1]);

  // Collect candidate result strings from multiple places on the page:
  const candidates = [];

  // 1. Page title — e.g. "RCB Won By 6 Wickets - 1st Match Scorecard | Cricbuzz"
  const titleM = html.match(/<title>([^<]*)<\/title>/i);
  if (titleM) {
    console.log(`  page title: ${titleM[1].trim()}`);
    candidates.push(titleM[1]);
  }

  // 2. Green result strip — <div class="...cb-lv-grn-strip...">RCB Won By 6 Wickets</div>
  const stripRe = /cb-lv-grn-strip[^>]*>([^<]{5,150})</gi;
  let st;
  while ((st = stripRe.exec(html)) !== null) {
    console.log(`  strip: ${st[1].trim()}`);
    candidates.push(st[1]);
  }

  // 3. Any span/div containing "won by" (broader sweep)
  const tagRe = /<(?:span|div|p)[^>]*>([^<]{10,200}won by[^<]{5,100})<\/(?:span|div|p)>/gi;
  let tg;
  while ((tg = tagRe.exec(html)) !== null) candidates.push(tg[1]);

  // 4. Raw text anywhere on page
  candidates.push(html);

  // Try each candidate for a valid team result
  const resultRe = /([\w\s]{3,50}?)\s+[Ww]on\s+[Bb]y\s+([\d]+\s+(?:[Rr]uns?|[Ww]ickets?)(?:\s+\([^)]{0,30}\))?)/g;
  for (const text of candidates) {
    resultRe.lastIndex = 0;
    let match;
    while ((match = resultRe.exec(text)) !== null) {
      const winnerRaw  = match[1].trim();
      const winnerCode = resolveTeamCode(winnerRaw);
      if (winnerCode === team1Code || winnerCode === team2Code) {
        console.log(`  ✅ valid result: "${winnerRaw}" won by ${match[2].trim()}`);
        return {
          status: "finished",
          winner: winnerCode,
          result: `${winnerRaw} won by ${match[2].trim()}`,
          scores: rawScores,
        };
      } else if (winnerCode) {
        console.log(`  ⚠ skipping: ${winnerRaw} → ${winnerCode} (not ${team1Code}/${team2Code})`);
      }
    }
  }

  const isLive = /\bLIVE\b/.test(html) || html.includes("cb-font-live");
  if (isLive) return { status: "live", scores: rawScores };
  return { status: "unknown", scores: rawScores };
}

// ── Main fetch logic ─────────────────────────────────────────────────────────
async function fetchScore(team1, team2) {
  const t1 = team1.toUpperCase().trim();
  const t2 = team2.toUpperCase().trim();
  console.log(`\n[proxy] looking for: ${t1} vs ${t2}`);

  // IPL 2026 series page first, then fallback to generic pages
  const pages = [
    "https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches",
    "https://www.cricbuzz.com/cricket-match/live-scores",
    "https://www.cricbuzz.com/cricket-match/recent-matches",
  ];

  let matchUrl = null;
  let matchId  = null;

  for (const pageUrl of pages) {
    console.log(`  checking ${pageUrl}`);
    let res;
    try { res = await get(pageUrl); } catch (e) { console.log(`  error: ${e.message}`); continue; }
    if (res.status !== 200) { console.log(`  HTTP ${res.status}`); continue; }

    // Extract all match links: /live-cricket-scores/12345/srh-vs-rcb-...
    const linkRe = /href="(\/(?:live-cricket-scores|cricket-match-scorecard)\/(\d+)\/([^"?]+))"/gi;
    let m;
    const found = [];
    while ((m = linkRe.exec(res.body)) !== null) {
      found.push({ path: m[1], id: m[2], slug: m[3] });
    }
    console.log(`  found ${found.length} match links`);

    // Find the one that matches both teams
    for (const { path, id, slug } of found) {
      if (slugContainsTeam(slug, t1) && slugContainsTeam(slug, t2)) {
        console.log(`  ✅ matched: ${slug} (id=${id})`);
        matchUrl = `https://www.cricbuzz.com${path}`;
        matchId  = id;
        break;
      }
    }

    if (matchUrl) break;

    // Log first few slugs to help with debugging
    if (found.length > 0) {
      console.log(`  sample slugs:`, found.slice(0, 3).map((f) => f.slug));
    }
  }

  if (!matchUrl) {
    // Try direct search via Cricbuzz typeahead
    console.log("  trying cricbuzz typeahead search...");
    try {
      const searchRes = await get(
        `https://www.cricbuzz.com/search/typeahead?query=${encodeURIComponent(`${t1} vs ${t2}`)}`,
        { Accept: "application/json" }
      );
      console.log(`  search response (${searchRes.body.length} bytes):`, searchRes.body.slice(0, 200));
      const json = JSON.parse(searchRes.body);
      const matches = json.matches || json.results || [];
      if (matches.length > 0) {
        const first = matches[0];
        matchId = first.matchId || first.id;
        if (matchId) {
          matchUrl = `https://www.cricbuzz.com/live-cricket-scores/${matchId}/`;
        }
      }
    } catch (e) {
      console.log("  typeahead failed:", e.message);
    }
  }

  if (!matchUrl) {
    return { found: false, reason: "Could not locate match on Cricbuzz. Check the console for debug info." };
  }

  // Fetch the match page
  console.log(`  fetching match page: ${matchUrl}`);
  let page;
  try { page = await get(matchUrl); } catch (e) {
    return { found: false, reason: `Failed to fetch match page: ${e.message}` };
  }
  console.log(`  match page: HTTP ${page.status}, ${page.body.length} bytes`);

  if (page.status !== 200 || page.body.length < 500) {
    return { found: false, reason: `Match page returned HTTP ${page.status}` };
  }

  const parsed = parseMatchPage(page.body, t1, t2);
  console.log(`  result:`, parsed);

  return { found: true, matchId, matchUrl, ...parsed };
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const parsed = url.parse(req.url, true);

  if (parsed.pathname === "/health") {
    res.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
    return;
  }

  if (parsed.pathname === "/score") {
    const { team1, team2 } = parsed.query;
    if (!team1 || !team2) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Use /score?team1=SRH&team2=RCB" }));
      return;
    }
    try {
      const result = await fetchScore(String(team1), String(team2));
      res.end(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error("[proxy] unhandled error:", err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Use /score?team1=SRH&team2=RCB or /health" }));
});

server.listen(PORT, () => {
  console.log(`\n✅  Cricket proxy running on http://localhost:${PORT}`);
  console.log(`\nTest: http://localhost:${PORT}/score?team1=SRH&team2=RCB`);
  console.log(`      http://localhost:${PORT}/health\n`);
});
