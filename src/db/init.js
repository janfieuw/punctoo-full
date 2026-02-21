const db = require("./index");

/**
 * Creates tables if they don't exist.
 * This does NOT wipe anything.
 */
async function initDb() {
  // customer_number sequence
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'customer_number_seq') THEN
        CREATE SEQUENCE customer_number_seq START 1000;
      END IF;
    END $$;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id UUID PRIMARY KEY,
      customer_number BIGINT NOT NULL DEFAULT nextval('customer_number_seq'),
      subscription_start_date DATE NOT NULL DEFAULT CURRENT_DATE,

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

      admin_seen BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS company_members (
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (company_id, user_id)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

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

  await db.query(`
    CREATE TABLE IF NOT EXISTS scantag_orders (
      id UUID PRIMARY KEY,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      delivery_name TEXT NOT NULL,
      delivery_address_line1 TEXT NOT NULL,
      delivery_address_line2 TEXT,
      delivery_postcode TEXT NOT NULL,
      delivery_city TEXT NOT NULL,
      delivery_country TEXT NOT NULL DEFAULT 'BE',
      quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
      admin_seen BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','processing','done','cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seed helper index
  await db.query(`CREATE INDEX IF NOT EXISTS idx_company_sub_start ON companies(subscription_start_date DESC);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_orders_created ON scantag_orders(created_at DESC);`);
}

module.exports = { initDb };
