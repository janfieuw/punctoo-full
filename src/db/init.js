const db = require("./index");

async function initDb() {
  // Companies
  await db.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id UUID PRIMARY KEY,
      company_name TEXT NOT NULL,
      vat_number TEXT NOT NULL,
      company_address_line1 TEXT NOT NULL,
      company_address_line2 TEXT,
      company_postcode TEXT NOT NULL,
      company_city TEXT NOT NULL,
      company_country TEXT NOT NULL DEFAULT 'BE',

      delivery_name TEXT NOT NULL,
      delivery_address_line1 TEXT NOT NULL,
      delivery_address_line2 TEXT,
      delivery_postcode TEXT NOT NULL,
      delivery_city TEXT NOT NULL,
      delivery_country TEXT NOT NULL DEFAULT 'BE',

      customer_number INTEGER UNIQUE NOT NULL,
      subscription_start_date DATE NOT NULL,

      admin_seen BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Users (one login per company in this v0)
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Employees
  await db.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id UUID PRIMARY KEY,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      employee_name TEXT NOT NULL,
      pairing_code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(company_id, pairing_code)
    );
  `);

  // ScanTags
  await db.query(`
    CREATE TABLE IF NOT EXISTS scantags (
      id UUID PRIMARY KEY,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      tag_name TEXT NOT NULL,
      tag_code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(company_id, tag_code)
    );
  `);

  // Orders for extra ScanTags
  await db.query(`
    CREATE TABLE IF NOT EXISTS scantag_orders (
      id UUID PRIMARY KEY,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      delivery_name TEXT NOT NULL,
      delivery_address_line1 TEXT NOT NULL,
      delivery_address_line2 TEXT,
      delivery_postcode TEXT NOT NULL,
      delivery_city TEXT NOT NULL,
      delivery_country TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      admin_seen BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create simple sequence for customer numbers (fallback using max+1)
  // Not using sequences to keep Railway portability with UUID primary keys
}

module.exports = { initDb };
