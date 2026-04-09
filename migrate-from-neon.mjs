/**
 * Migrates matches, users, and bets from the Neon (Replit) database to local PostgreSQL.
 * Run: node migrate-from-neon.mjs
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, 'node_modules', '.pnpm', 'pg@8.20.0', 'node_modules', 'pg', 'package.json'));
const pg = require('./lib/index.js');
const { Pool } = pg;

const NEON_URL = "postgresql://neondb_owner:npg_OZTCJ6oc9lys@ep-blue-salad-ajjo6d08.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require";
const LOCAL_URL = "postgresql://postgres:postgres@localhost:5432/bettingfun";

// UUID of the local admin user (rdev8921@gmail.com already exists)
const KNOWN_LOCAL_USERS = {
  "rdev8921@gmail.com": "3775cff9-f509-4364-aba9-91880e9a9996",
};

const neon = new Pool({ connectionString: NEON_URL });
const local = new Pool({ connectionString: LOCAL_URL });

function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function run() {
  console.log("=== Neon → Local migration ===\n");

  // ── 1. Fetch all data from Neon ──────────────────────────────────────────
  const { rows: neonUsers } = await neon.query(
    "SELECT id, email, username, first_name, last_name, profile_image_url, custom_avatar_url, is_admin, status, created_at FROM users ORDER BY id"
  );
  const { rows: neonMatches } = await neon.query(
    "SELECT id, team1, team2, match_date, status, winner, score, cricapi_match_id, created_at FROM matches ORDER BY id"
  );
  const { rows: neonBets } = await neon.query(
    "SELECT id, user_id, match_id, team, amount, status, payout, created_at FROM bets ORDER BY id"
  );

  console.log(`Neon: ${neonUsers.length} users, ${neonMatches.length} matches, ${neonBets.length} bets`);

  // ── 2. Build user ID mapping (old Neon integer ID → local UUID) ──────────
  // Check if user already exists in local DB by email first
  const userIdMap = {}; // neon integer id (string) → local UUID

  const { rows: existingLocalUsers } = await local.query("SELECT id, email FROM users");
  const localByEmail = {};
  for (const u of existingLocalUsers) localByEmail[u.email] = u.id;

  for (const u of neonUsers) {
    if (localByEmail[u.email]) {
      userIdMap[String(u.id)] = localByEmail[u.email];
      console.log(`  User ${u.email}: found existing UUID ${localByEmail[u.email]}`);
    } else if (KNOWN_LOCAL_USERS[u.email]) {
      userIdMap[String(u.id)] = KNOWN_LOCAL_USERS[u.email];
      console.log(`  User ${u.email}: using known UUID ${KNOWN_LOCAL_USERS[u.email]}`);
    } else {
      userIdMap[String(u.id)] = randomUUID();
      console.log(`  User ${u.email}: assigned new UUID ${userIdMap[String(u.id)]}`);
    }
  }

  // ── 3. Clear local bets + matches (keep users) ───────────────────────────
  console.log("\nClearing local bets and matches...");
  await local.query("DELETE FROM bets");
  await local.query("DELETE FROM matches");
  console.log("  Cleared.");

  // ── 4. Import matches ────────────────────────────────────────────────────
  console.log("\nImporting matches...");
  for (const m of neonMatches) {
    await local.query(
      `INSERT INTO matches (id, team1, team2, match_date, status, winner, score, cricapi_match_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
       ON CONFLICT (id) DO UPDATE SET
         team1=EXCLUDED.team1, team2=EXCLUDED.team2, match_date=EXCLUDED.match_date,
         status=EXCLUDED.status, winner=EXCLUDED.winner, score=EXCLUDED.score,
         cricapi_match_id=EXCLUDED.cricapi_match_id, updated_at=now()`,
      [m.id, m.team1, m.team2, m.match_date, m.status, m.winner || null,
       m.score || null, m.cricapi_match_id || null, m.created_at]
    );
  }
  // Reset sequence to max id
  await local.query("SELECT setval('matches_id_seq', (SELECT MAX(id) FROM matches))");
  console.log(`  Imported ${neonMatches.length} matches.`);

  // ── 5. Upsert users ──────────────────────────────────────────────────────
  console.log("\nUpserting users...");
  for (const u of neonUsers) {
    const localUUID = userIdMap[String(u.id)];
    await local.query(
      `INSERT INTO users (id, email, username, first_name, last_name, profile_image_url, custom_avatar_url, is_admin, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
       ON CONFLICT DO NOTHING`,
      [localUUID, u.email, u.username, u.first_name || null, u.last_name || null,
       u.profile_image_url || null, u.custom_avatar_url || null,
       u.is_admin, u.status, u.created_at]
    );
  }
  console.log(`  Upserted ${neonUsers.length} users.`);

  // ── 6. Import bets ───────────────────────────────────────────────────────
  console.log("\nImporting bets...");
  let skipped = 0;
  for (const b of neonBets) {
    const localUserId = userIdMap[String(b.user_id)];
    if (!localUserId) { skipped++; continue; }
    await local.query(
      `INSERT INTO bets (id, user_id, match_id, team, amount, status, payout, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         team=EXCLUDED.team, amount=EXCLUDED.amount, status=EXCLUDED.status,
         payout=EXCLUDED.payout`,
      [b.id, localUserId, b.match_id, b.team, b.amount, b.status,
       b.payout || null, b.created_at]
    );
  }
  await local.query("SELECT setval('bets_id_seq', (SELECT MAX(id) FROM bets))");
  console.log(`  Imported ${neonBets.length - skipped} bets (${skipped} skipped).`);

  // ── 7. Summary ───────────────────────────────────────────────────────────
  const { rows: [mc] } = await local.query("SELECT COUNT(*) FROM matches");
  const { rows: [uc] } = await local.query("SELECT COUNT(*) FROM users");
  const { rows: [bc] } = await local.query("SELECT COUNT(*) FROM bets");
  console.log(`\n✓ Done! Local DB now has: ${mc.count} matches, ${uc.count} users, ${bc.count} bets`);
  console.log("\nUser ID mapping (save this — needed when users log in via Google):");
  for (const u of neonUsers) {
    console.log(`  ${u.email.padEnd(30)} → ${userIdMap[String(u.id)]}`);
  }

  await neon.end();
  await local.end();
}

run().catch(err => { console.error("Migration failed:", err); process.exit(1); });
