const express = require('express');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');

const app = express();

// Parse incoming JSON request bodies
app.use(express.json());

// --- Routes ---
app.use('/v1', authRoutes);
app.use('/v1/users', userRoutes);
app.use('/v1/accounts', accountRoutes);
// Transactions are nested under accounts: /v1/accounts/:accountNumber/transactions
app.use('/v1/accounts', transactionRoutes);

// --- Global error handler (must be last) ---
app.use(errorHandler);

module.exports = app;
