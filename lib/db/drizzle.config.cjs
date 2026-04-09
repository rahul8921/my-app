/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
