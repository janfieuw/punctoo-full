const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in environment");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : (process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined),
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
