const { Router } = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { nanoid } = require('nanoid');
const db = require('../db/database');
const authenticate = require('../middleware/auth');
const AppError = require('../errors/AppError');

const router = Router();

// --- Zod Schemas ---

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  line3: z.string().optional(),
  town: z.string().min(1),
  county: z.string().min(1),
  postcode: z.string().min(1),
});

// POST /v1/users — password is required at signup but not in the OpenAPI
// schema (the spec doesn't model it since it's never returned). We add it here.
const createUserSchema = z.object({
  name: z.string().min(1),
  address: addressSchema,
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Must be E.164 format e.g. +447911123456'),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  address: addressSchema.optional(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),
  email: z.string().email().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

// --- Helpers ---

// Shapes a DB row into the API response format defined in the OpenAPI spec
function formatUser(user) {
  return {
    id: user.id,
    name: user.name,
    address: {
      line1: user.address_line1,
      line2: user.address_line2 || undefined,
      line3: user.address_line3 || undefined,
      town: user.address_town,
      county: user.address_county,
      postcode: user.address_postcode,
    },
    phoneNumber: user.phone_number,
    email: user.email,
    createdTimestamp: user.created_timestamp,
    updatedTimestamp: user.updated_timestamp,
  };
}

// --- Routes ---

/**
 * POST /v1/users
 * Create a new user. No auth required — this is the signup endpoint.
 */
router.post('/', async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);

    // Check email isn't already taken
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email);
    if (existing) {
      throw new AppError('A user with this email already exists', 409);
    }

    // Hash the password — bcrypt with 10 salt rounds is the standard
    const passwordHash = await bcrypt.hash(data.password, 10);

    const now = new Date().toISOString();
    // IDs follow the pattern from the spec: usr-<random>
    const id = `usr-${nanoid(8)}`;

    db.prepare(`
      INSERT INTO users (
        id, name,
        address_line1, address_line2, address_line3,
        address_town, address_county, address_postcode,
        phone_number, email, password_hash,
        created_timestamp, updated_timestamp
      ) VALUES (
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?
      )
    `).run(
      id, data.name,
      data.address.line1, data.address.line2 ?? null, data.address.line3 ?? null,
      data.address.town, data.address.county, data.address.postcode,
      data.phoneNumber, data.email, passwordHash,
      now, now
    );

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return res.status(201).json(formatUser(user));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/users/:userId
 * Fetch a user by ID. Users can only fetch their own details.
 */
router.get('/:userId', authenticate, (req, res, next) => {
  try {
    const { userId } = req.params;

    // 403 — authenticated user is trying to access someone else's data
    if (req.user.id !== userId) {
      throw new AppError('You are not allowed to access this user', 403);
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return res.status(200).json(formatUser(user));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /v1/users/:userId
 * Update a user's details. Users can only update their own details.
 */
router.patch('/:userId', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (req.user.id !== userId) {
      throw new AppError('You are not allowed to update this user', 403);
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const data = updateUserSchema.parse(req.body);
    const now = new Date().toISOString();

    // Build the update dynamically — only set fields that were supplied
    db.prepare(`
      UPDATE users SET
        name              = COALESCE(?, name),
        address_line1     = COALESCE(?, address_line1),
        address_line2     = COALESCE(?, address_line2),
        address_line3     = COALESCE(?, address_line3),
        address_town      = COALESCE(?, address_town),
        address_county    = COALESCE(?, address_county),
        address_postcode  = COALESCE(?, address_postcode),
        phone_number      = COALESCE(?, phone_number),
        email             = COALESCE(?, email),
        updated_timestamp = ?
      WHERE id = ?
    `).run(
      data.name ?? null,
      data.address?.line1 ?? null,
      data.address?.line2 ?? null,
      data.address?.line3 ?? null,
      data.address?.town ?? null,
      data.address?.county ?? null,
      data.address?.postcode ?? null,
      data.phoneNumber ?? null,
      data.email ?? null,
      now,
      userId
    );

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return res.status(200).json(formatUser(updated));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /v1/users/:userId
 * Delete a user. Blocked if the user still has bank accounts.
 */
router.delete('/:userId', authenticate, (req, res, next) => {
  try {
    const { userId } = req.params;

    if (req.user.id !== userId) {
      throw new AppError('You are not allowed to delete this user', 403);
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // 409 Conflict — can't delete a user who still has accounts
    const accountCount = db
      .prepare('SELECT COUNT(*) as count FROM accounts WHERE user_id = ?')
      .get(userId);

    if (accountCount.count > 0) {
      throw new AppError('User cannot be deleted while they have active bank accounts', 409);
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
