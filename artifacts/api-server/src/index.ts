import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// Reset serial sequences on startup to avoid duplicate key errors when
// rows were inserted outside of the sequence (e.g. DB restores or migrations).
async function fixSequences() {
  try {
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('bets', 'id'), COALESCE((SELECT MAX(id) FROM bets), 0))`);
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('matches', 'id'), COALESCE((SELECT MAX(id) FROM matches), 0))`);
    logger.info("DB sequences verified");
  } catch (err) {
    logger.warn({ err }, "Could not reset sequences — continuing anyway");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

fixSequences().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
});
