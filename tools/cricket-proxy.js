/**
 * cricket-proxy.js  –  Run this on your LOCAL machine, not on Replit.
 *
 * Setup (one time):
 *   1. Install ngrok: https://ngrok.com/download  (free account)
 *   2. Run this script: node cricket-proxy.js
 *   3. In another terminal: ngrok http 3001
 *   4. Copy the ngrok URL (e.g. https://abc123.ngrok-free.app)
 *   5. Set it as CRICKET_PROXY_URL in your Replit environment secrets
 *
 * No npm install needed — pure Node.js built-ins only.
 */

const http  = require("http");
const https = require("https");
const url   = require("url");

const PORT = 3001;

// ── HTTP helper ──────────────────────────────────────────────────────────────
function get(targetUrl, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === "https:" ? https : http;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        ...extraHeaders,
      },
    };

    const req = lib.request(options, (res) => {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
        return get(next, extraHeaders).then(resolve).catch(reject);
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

// ── Cricbuzz: search for a match ─────────────────────────────────────────────
async function fetchFromCricbuzz(team1, team2) {
  const query = `${team1} vs ${team2}`;

  // 1. Try typeahead search to find the match ID
  const searchRes = await get(
    `https://www.cricbuzz.com/api/cricket-match/search?query=${encodeURIComponent(query)}`,
    { Accept: "application/json", Referer: "https://www.cricbuzz.com/" }
  );

  let matchId = null;
  try {
    const json = JSON.parse(searchRes.body);
    const matches = json.matches || json.matchDetails || [];
    if (matches.length > 0) matchId = matches[0].matchId || matches[0].id;
  } catch { /* fall through */ }

  // 2. Try live scores page if search didn't give us an ID
  if (!matchId) {
    const liveRes = await get("https://www.cricbuzz.com/cricket-match/live-scores");
    // Extract match IDs from links like /live-cricket-scores/89784/...
    const linkRe = /\/live-cricket-scores\/(\d+)\/[^"'\s]*(ipl|indian-premier)[^"'\s]*/gi;
    let m;
    const ids = new Set();
    while ((m = linkRe.exec(liveRes.body)) !== null) ids.add(m[1]);

    // Also check recent results page
    if (ids.size === 0) {
      const recentRes = await get("https://www.cricbuzz.com/cricket-match/recent-matches");
      const re2 = /\/live-cricket-scores\/(\d+)\//g;
      while ((m = re2.exec(recentRes.body)) !== null) ids.add(m[1]);
    }

    // Pick the first ID that looks relevant (we'll check a few)
    for (const id of [...ids].slice(0, 5)) {
      const slug = `${team1.toLowerCase()}-vs-${team2.toLowerCase()}`;
      const altSlug = `${team2.toLowerCase()}-vs-${team1.toLowerCase()}`;
      const html = liveRes.body;
      if (html.includes(id) && (html.toLowerCase().includes(slug) || html.toLowerCase().includes(altSlug))) {
        matchId = id;
        break;
      }
      if (!matchId) matchId = [...ids][0]; // fallback: try first IPL match
    }
  }

  if (!matchId) return null;

  // 3. Fetch the actual match scorecard page
  const scorecardUrl = `https://www.cricbuzz.com/live-cricket-scores/${matchId}/`;
  const page = await get(scorecardUrl, { Referer: "https://www.cricbuzz.com/" });
  const html = page.body;

  if (page.status !== 200 || !html || html.length < 500) return null;

  console.log(`[cricbuzz] fetched match page (${html.length} bytes) for ID ${matchId}`);

  // ── Parse score from HTML ──
  // Result banner: "RCB won by 6 wickets" or "SRH won by 42 runs"
  const resultRe = /([\w\s]+?)\s+won\s+by\s+([\d]+\s+(?:runs?|wickets?))/i;
  const resultMatch = html.match(resultRe);

  // Scores: "183/4 (20 Ovs)" or "201/4 (19.2 Ovs)"
  const scoreRe = /(\d{2,3}\/\d{1,2})\s*\([\d.]+\s*Ov/gi;
  const rawScores = [];
  let sm;
  while ((sm = scoreRe.exec(html)) !== null) rawScores.push(sm[1]);

  // Team name from page title
  const titleRe = /<title>([^<]*)<\/title>/i;
  const titleMatch = html.match(titleRe);
  const pageTitle = titleMatch ? titleMatch[1] : "";

  if (resultMatch) {
    const winnerRaw = resultMatch[1].trim();
    // Resolve to short team code
    const winner = resolveTeam(winnerRaw, team1, team2);
    return {
      found: true,
      source: "cricbuzz",
      matchId,
      status: "finished",
      winner,
      result: `${winnerRaw} won by ${resultMatch[2]}`,
      scores: rawScores,
      pageTitle,
    };
  }

  // Check if match is live / in progress
  if (html.includes("LIVE") || html.includes("live-match")) {
    return {
      found: true,
      source: "cricbuzz",
      matchId,
      status: "live",
      scores: rawScores,
      pageTitle,
    };
  }

  // Match exists but no clear result yet
  return { found: true, source: "cricbuzz", matchId, status: "unknown", scores: rawScores, pageTitle };
}

// ── Team code resolver ───────────────────────────────────────────────────────
const TEAM_KEYWORDS = {
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

function resolveTeam(name, team1, team2) {
  const lower = name.toLowerCase();
  for (const [code, keywords] of Object.entries(TEAM_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return code;
  }
  // Fallback: see if it contains team1 or team2 directly
  if (lower.includes(team1.toLowerCase())) return team1;
  if (lower.includes(team2.toLowerCase())) return team2;
  return name;
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
      res.end(JSON.stringify({ error: "Missing team1 or team2 query params" }));
      return;
    }

    console.log(`[proxy] score request: ${team1} vs ${team2}`);

    try {
      const result = await fetchFromCricbuzz(String(team1), String(team2));
      if (result) {
        console.log(`[proxy] result:`, result);
        res.end(JSON.stringify(result));
      } else {
        res.end(JSON.stringify({ found: false, reason: "Match not found on Cricbuzz" }));
      }
    } catch (err) {
      console.error("[proxy] error:", err.message);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Unknown endpoint. Use /score?team1=SRH&team2=RCB or /health" }));
});

server.listen(PORT, () => {
  console.log(`\n✅  Cricket proxy running on http://localhost:${PORT}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Open a new terminal and run: ngrok http ${PORT}`);
  console.log(`  2. Copy the https URL from ngrok (e.g. https://abc123.ngrok-free.app)`);
  console.log(`  3. Set CRICKET_PROXY_URL to that URL in your Replit Secrets`);
  console.log(`\nTest it: http://localhost:${PORT}/score?team1=SRH&team2=RCB\n`);
});
