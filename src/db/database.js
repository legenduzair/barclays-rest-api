const Database = require('better-sqlite3');
const path = require('path');

// The database file lives at the project root. better-sqlite3 creates it
// automatically if it doesn't exist, so there's no setup step needed.
const db = new Database(path.join(__dirname, '../../eagle-bank.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create tables if they don't already exist.
// We use IF NOT EXISTS so this is safe to run every time the server starts.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    address_line1     TEXT NOT NULL,
    address_line2     TEXT,
    address_line3     TEXT,
    address_town      TEXT NOT NULL,
    address_county    TEXT NOT NULL,
    address_postcode  TEXT NOT NULL,
    phone_number      TEXT NOT NULL,
    email             TEXT NOT NULL UNIQUE,
    password_hash     TEXT NOT NULL,
    created_timestamp TEXT NOT NULL,
    updated_timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    account_number    TEXT PRIMARY KEY,
    sort_code         TEXT NOT NULL DEFAULT '10-10-10',
    name              TEXT NOT NULL,
    account_type      TEXT NOT NULL DEFAULT 'personal',
    balance           REAL NOT NULL DEFAULT 0.00,
    currency          TEXT NOT NULL DEFAULT 'GBP',
    user_id           TEXT NOT NULL,
    created_timestamp TEXT NOT NULL,
    updated_timestamp TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id                TEXT PRIMARY KEY,
    account_number    TEXT NOT NULL,
    amount            REAL NOT NULL,
    currency          TEXT NOT NULL DEFAULT 'GBP',
    type              TEXT NOT NULL,
    reference         TEXT,
    created_timestamp TEXT NOT NULL,
    FOREIGN KEY (account_number) REFERENCES accounts(account_number)
  );
`);

module.exports = db;
