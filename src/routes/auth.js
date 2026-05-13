const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db/database');
const AppError = require('../errors/AppError');

const router = Router();

// Zod schema — validates the login request body
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /v1/auth/login
 *
 * Accepts email + password, returns a signed JWT on success.
 * The JWT payload contains the user's id and email so downstream
 * middleware can identify who is making each request.
 */
router.post('/auth/login', async (req, res, next) => {
  try {
    // 1. Validate request body — throws ZodError if invalid → caught by errorHandler → 400
    const { email, password } = loginSchema.parse(req.body);

    // 2. Look up the user by email
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      // Use a generic message — don't reveal whether the email exists
      throw new AppError('Invalid email or password', 401);
    }

    // 3. Compare the supplied password against the stored bcrypt hash
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    // 4. Sign a JWT — expires in 24 hours
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({ token });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
