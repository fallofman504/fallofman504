import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  service TEXT NOT NULL,
  details_json TEXT NOT NULL,
  email TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafting',
  pay_method TEXT,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  signed_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  preview_at INTEGER,
  paid_at INTEGER,
  delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status, created_at);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS files_order ON files(order_id);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  building TEXT NOT NULL,
  sf INTEGER,
  created_at INTEGER NOT NULL
);
`;

const g = globalThis as unknown as { __peerlessDb?: Database.Database };

export function db(): Database.Database {
  if (!g.__peerlessDb) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const d = new Database(path.join(DATA_DIR, "peerless.db"));
    d.pragma("journal_mode = WAL");
    d.pragma("foreign_keys = ON");
    d.exec(SCHEMA);
    g.__peerlessDb = d;
  }
  return g.__peerlessDb;
}
