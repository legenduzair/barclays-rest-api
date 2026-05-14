const { Router } = require('express');
const { z } = require('zod');
const { nanoid } = require('nanoid');
const db = require('../db/database');
const authenticate = require('../middleware/auth');
const AppError = require('../errors/AppError');

const router = Router();

// --- Zod Schema ---

const createTransactionSchema = z.object({
  amount: z.number().positive('Amount must be greater than 0').max(10000),
  currency: z.enum(['GBP']),
  type: z.enum(['deposit', 'withdrawal']),
  reference: z.string().optional(),
});

// --- Helpers ---

/**
 * Finds an account by number and verifies ownership.
 * Throws 404 if not found, 403 if it belongs to another user.
 */
function getAccountOrThrow(accountNumber, userId) {
  const account = db.prepare('SELECT * FROM accounts WHERE account_number = ?').get(accountNumber);

  if (!account) {
    throw new AppError('Bank account not found', 404);
  }

  if (account.user_id !== userId) {
    throw new AppError('You are not allowed to access this bank account', 403);
  }

  return account;
}

/**
 * Format a DB row into the API response shape from the OpenAPI spec.
 */
function formatTransaction(txn) {
  return {
    id: txn.id,
    amount: txn.amount,
    currency: txn.currency,
    type: txn.type,
    reference: txn.reference || undefined,
    createdTimestamp: txn.created_timestamp,
  };
}

// --- Routes ---

/**
 * POST /v1/accounts/:accountNumber/transactions
 *
 * Create a deposit or withdrawal. This is the core banking logic:
 * - Deposits increase the balance
 * - Withdrawals decrease it (but fail with 422 if insufficient funds)
 *
 * Both the transaction insert and balance update happen in a single
 * SQLite transaction (db.transaction) so they either both succeed or
 * both fail — no partial state.
 */
router.post('/:accountNumber/transactions', authenticate, (req, res, next) => {
  try {
    const { accountNumber } = req.params;
    const account = getAccountOrThrow(accountNumber, req.user.id);

    const data = createTransactionSchema.parse(req.body);

    // Check sufficient funds for withdrawals
    if (data.type === 'withdrawal' && account.balance < data.amount) {
      throw new AppError('Insufficient funds to process this transaction', 422);
    }

    const now = new Date().toISOString();
    // Transaction IDs follow the spec pattern: tan-<random>
    const id = `tan-${nanoid(8)}`;

    // Calculate new balance
    const newBalance = data.type === 'deposit'
      ? account.balance + data.amount
      : account.balance - data.amount;

    // Use a DB transaction to ensure atomicity — both writes succeed or neither does
    const execute = db.transaction(() => {
      db.prepare(`
        INSERT INTO transactions (id, account_number, amount, currency, type, reference, created_timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, accountNumber, data.amount, data.currency, data.type, data.reference ?? null, now);

      db.prepare(`
        UPDATE accounts SET balance = ?, updated_timestamp = ? WHERE account_number = ?
      `).run(newBalance, now, accountNumber);
    });

    execute();

    const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    return res.status(201).json(formatTransaction(txn));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/accounts/:accountNumber/transactions
 * List all transactions on a bank account.
 */
router.get('/:accountNumber/transactions', authenticate, (req, res, next) => {
  try {
    const { accountNumber } = req.params;
    getAccountOrThrow(accountNumber, req.user.id);

    const transactions = db
      .prepare('SELECT * FROM transactions WHERE account_number = ? ORDER BY created_timestamp DESC')
      .all(accountNumber);

    return res.status(200).json({
      transactions: transactions.map(formatTransaction),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/accounts/:accountNumber/transactions/:transactionId
 * Fetch a single transaction. Must belong to the specified account.
 */
router.get('/:accountNumber/transactions/:transactionId', authenticate, (req, res, next) => {
  try {
    const { accountNumber, transactionId } = req.params;
    getAccountOrThrow(accountNumber, req.user.id);

    const txn = db
      .prepare('SELECT * FROM transactions WHERE id = ? AND account_number = ?')
      .get(transactionId, accountNumber);

    if (!txn) {
      throw new AppError('Transaction not found', 404);
    }

    return res.status(200).json(formatTransaction(txn));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
