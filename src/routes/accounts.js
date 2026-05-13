const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/database');
const authenticate = require('../middleware/auth');
const AppError = require('../errors/AppError');

const router = Router();

// --- Zod Schemas ---

const createAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  accountType: z.enum(['personal']),
});

const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  accountType: z.enum(['personal']).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

// --- Helpers ---

/**
 * Generate an account number matching the spec pattern: 01 followed by 6 random digits.
 * e.g. "01384729"
 */
function generateAccountNumber() {
  const randomSixDigits = Math.floor(100000 + Math.random() * 900000).toString();
  return `01${randomSixDigits}`;
}

/**
 * Format a DB row into the API response shape defined in the OpenAPI spec.
 */
function formatAccount(account) {
  return {
    accountNumber: account.account_number,
    sortCode: account.sort_code,
    name: account.name,
    accountType: account.account_type,
    balance: account.balance,
    currency: account.currency,
    createdTimestamp: account.created_timestamp,
    updatedTimestamp: account.updated_timestamp,
  };
}

// --- Routes ---

/**
 * POST /v1/accounts
 * Create a new bank account for the authenticated user.
 */
router.post('/', authenticate, (req, res, next) => {
  try {
    const data = createAccountSchema.parse(req.body);
    const now = new Date().toISOString();

    // Generate a unique account number — retry if collision (extremely unlikely)
    let accountNumber;
    let exists = true;
    while (exists) {
      accountNumber = generateAccountNumber();
      exists = db.prepare('SELECT 1 FROM accounts WHERE account_number = ?').get(accountNumber);
    }

    db.prepare(`
      INSERT INTO accounts (
        account_number, sort_code, name, account_type,
        balance, currency, user_id,
        created_timestamp, updated_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      accountNumber, '10-10-10', data.name, data.accountType,
      0.00, 'GBP', req.user.id,
      now, now
    );

    const account = db.prepare('SELECT * FROM accounts WHERE account_number = ?').get(accountNumber);
    return res.status(201).json(formatAccount(account));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/accounts
 * List all bank accounts belonging to the authenticated user.
 */
router.get('/', authenticate, (req, res, next) => {
  try {
    const accounts = db
      .prepare('SELECT * FROM accounts WHERE user_id = ?')
      .all(req.user.id);

    return res.status(200).json({
      accounts: accounts.map(formatAccount),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/accounts/:accountNumber
 * Fetch a specific bank account. Must belong to the authenticated user.
 */
router.get('/:accountNumber', authenticate, (req, res, next) => {
  try {
    const { accountNumber } = req.params;

    const account = db.prepare('SELECT * FROM accounts WHERE account_number = ?').get(accountNumber);

    if (!account) {
      throw new AppError('Bank account not found', 404);
    }

    // Ownership check — 403 if it belongs to someone else
    if (account.user_id !== req.user.id) {
      throw new AppError('You are not allowed to access this bank account', 403);
    }

    return res.status(200).json(formatAccount(account));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /v1/accounts/:accountNumber
 * Update a bank account's name or type. Must belong to the authenticated user.
 */
router.patch('/:accountNumber', authenticate, (req, res, next) => {
  try {
    const { accountNumber } = req.params;

    const account = db.prepare('SELECT * FROM accounts WHERE account_number = ?').get(accountNumber);

    if (!account) {
      throw new AppError('Bank account not found', 404);
    }

    if (account.user_id !== req.user.id) {
      throw new AppError('You are not allowed to update this bank account', 403);
    }

    const data = updateAccountSchema.parse(req.body);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE accounts SET
        name              = COALESCE(?, name),
        account_type      = COALESCE(?, account_type),
        updated_timestamp = ?
      WHERE account_number = ?
    `).run(
      data.name ?? null,
      data.accountType ?? null,
      now,
      accountNumber
    );

    const updated = db.prepare('SELECT * FROM accounts WHERE account_number = ?').get(accountNumber);
    return res.status(200).json(formatAccount(updated));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /v1/accounts/:accountNumber
 * Delete a bank account. Must belong to the authenticated user.
 */
router.delete('/:accountNumber', authenticate, (req, res, next) => {
  try {
    const { accountNumber } = req.params;

    const account = db.prepare('SELECT * FROM accounts WHERE account_number = ?').get(accountNumber);

    if (!account) {
      throw new AppError('Bank account not found', 404);
    }

    if (account.user_id !== req.user.id) {
      throw new AppError('You are not allowed to delete this bank account', 403);
    }

    // Delete associated transactions first (foreign key), then the account
    db.prepare('DELETE FROM transactions WHERE account_number = ?').run(accountNumber);
    db.prepare('DELETE FROM accounts WHERE account_number = ?').run(accountNumber);

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
