import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT 'undecided',
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at INTEGER NOT NULL,
  quoted_at INTEGER
);
CREATE INDEX IF NOT EXISTS requests_user ON requests(user_id, created_at);
CREATE INDEX IF NOT EXISTS requests_status ON requests(status, created_at);
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  items_json TEXT NOT NULL,
  print_total_cents INTEGER,
  stl_price_cents INTEGER,
  shipping_cents INTEGER,
  delivery_cents INTEGER,
  lead_time_days INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS quotes_request ON quotes(request_id, created_at);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  quote_id TEXT REFERENCES quotes(id),
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS files_request ON files(request_id);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  quote_id TEXT REFERENCES quotes(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_request ON messages(request_id, created_at);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL REFERENCES requests(id),
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  fulfillment TEXT,
  address_json TEXT,
  subtotal_cents INTEGER NOT NULL,
  fulfillment_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  tracking TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_request ON orders(request_id);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  method TEXT,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS payments_order ON payments(order_id);
CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  fails INTEGER NOT NULL,
  last_failed_at INTEGER NOT NULL,
  locked_until INTEGER
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

/** Columns added after the first release; safe to run on every start. */
function migrate(d: Database.Database) {
  const has = (table: string, column: string) => (d.pragma(`table_info(${table})`) as { name: string }[]).some((c) => c.name === column);
  if (!has("requests", "kind")) d.exec("ALTER TABLE requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom'");
  if (!has("quotes", "status")) d.exec("ALTER TABLE quotes ADD COLUMN status TEXT NOT NULL DEFAULT 'sent'");
  if (!has("requests", "print_spec_json")) d.exec("ALTER TABLE requests ADD COLUMN print_spec_json TEXT");
}

const g = globalThis as unknown as { __squiggleDb?: Database.Database };

export function db(): Database.Database {
  if (!g.__squiggleDb) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const d = new Database(path.join(DATA_DIR, "squiggle.db"));
    d.pragma("journal_mode = WAL");
    d.pragma("foreign_keys = ON");
    d.exec(SCHEMA);
    migrate(d);
    g.__squiggleDb = d;
  }
  return g.__squiggleDb;
}
