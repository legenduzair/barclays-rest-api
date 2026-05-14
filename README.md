# Eagle Bank REST API

A REST API for a fictional bank built with Node.js, Express, and SQLite. Allows users to register, authenticate, manage bank accounts, and perform transactions (deposits/withdrawals).

## Tech Stack

| Technology | Purpose |
|---|---|
| Node.js + Express | HTTP framework |
| SQLite (better-sqlite3) | Relational database — zero setup, file-based |
| bcrypt | Password hashing |
| jsonwebtoken | JWT authentication |
| Zod | Request body validation |
| nanoid | ID generation (usr-xxx, tan-xxx) |

## Getting Started

### Prerequisites

- Node.js v18+ installed

### Installation

```bash
git clone https://github.com/legenduzair/barclays-rest-api.git
cd barclays-rest-api
npm install
```

### Running the Server

```bash
JWT_SECRET=your-secret-here npm start
```

The API will be available at `http://localhost:3000`.

For development with auto-restart:

```bash
npm run dev
```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `JWT_SECRET` | Secret key used to sign JWT tokens | (required) |
| `PORT` | Port the server listens on | 3000 |

## API Endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/v1/auth/login` | No | Login and receive a JWT token |

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/v1/users` | No | Register a new user |
| GET | `/v1/users/:userId` | Yes | Fetch your user details |
| PATCH | `/v1/users/:userId` | Yes | Update your user details |
| DELETE | `/v1/users/:userId` | Yes | Delete your account (no active bank accounts) |

### Bank Accounts

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/v1/accounts` | Yes | Create a new bank account |
| GET | `/v1/accounts` | Yes | List your bank accounts |
| GET | `/v1/accounts/:accountNumber` | Yes | Fetch a specific account |
| PATCH | `/v1/accounts/:accountNumber` | Yes | Update account details |
| DELETE | `/v1/accounts/:accountNumber` | Yes | Delete a bank account |

### Transactions

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/v1/accounts/:accountNumber/transactions` | Yes | Deposit or withdraw money |
| GET | `/v1/accounts/:accountNumber/transactions` | Yes | List all transactions |
| GET | `/v1/accounts/:accountNumber/transactions/:transactionId` | Yes | Fetch a single transaction |

## Usage Example

### 1. Register a user

```bash
curl -X POST http://localhost:3000/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "email": "john@example.com",
    "password": "securepass123",
    "phoneNumber": "+447911123456",
    "address": {
      "line1": "10 Downing Street",
      "town": "London",
      "county": "Greater London",
      "postcode": "SW1A 2AA"
    }
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com", "password": "securepass123"}'
```

Returns: `{ "token": "eyJhbG..." }`

### 3. Create a bank account

```bash
curl -X POST http://localhost:3000/v1/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "My Current Account", "accountType": "personal"}'
```

### 4. Deposit money

```bash
curl -X POST http://localhost:3000/v1/accounts/01234567/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"amount": 500, "currency": "GBP", "type": "deposit", "reference": "Salary"}'
```

## Design Decisions

### Database Choice — SQLite

SQLite was chosen for simplicity and zero-config setup. The reviewer can clone and run without installing a database server. In production, this would be swapped for PostgreSQL for concurrency, replication, and scalability. The SQL is standard and portable.

### Authentication — JWT with bcrypt

Passwords are hashed with bcrypt (10 salt rounds) before storage. JWTs are signed with a configurable secret and expire after 24 hours. The login endpoint returns a generic "Invalid email or password" message to prevent user enumeration attacks.

### Validation — Zod

Zod provides schema-based validation with clear, field-level error messages. Invalid requests fail fast before any database interaction, returning a 400 with details about which fields are missing or malformed.

### Transaction Atomicity

Deposits and withdrawals use SQLite's `db.transaction()` to ensure the transaction record and balance update either both succeed or both roll back. This prevents inconsistent state (e.g., a recorded transaction without a balance change).

### Immutable Transaction Ledger

Transactions can only be created and read — never updated or deleted. This mirrors real-world banking where corrections are made via new entries (refunds/reversals), preserving a complete audit trail.

### Authorization Model

Every protected endpoint verifies:
1. Valid JWT present (401 if not)
2. Resource belongs to the authenticated user (403 if not)
3. Resource exists (404 if not)

Users can only access their own data. There is no admin role.

## Project Structure

```
src/
├── app.js                  # Express app setup and route registration
├── server.js               # Entry point — starts the HTTP server
├── db/
│   └── database.js         # SQLite connection and schema creation
├── errors/
│   └── AppError.js         # Custom error class with HTTP status codes
├── middleware/
│   ├── auth.js             # JWT verification middleware
│   └── errorHandler.js     # Global error handler (Zod, AppError, 500s)
└── routes/
    ├── auth.js             # POST /v1/auth/login
    ├── users.js            # CRUD /v1/users
    ├── accounts.js         # CRUD /v1/accounts
    └── transactions.js     # Create/Read /v1/accounts/:id/transactions
```

## Future Improvements

If this were a production application, I would add:

### Security
- **Rate limiting** (e.g. `express-rate-limit`) on the login endpoint to prevent brute-force attacks
- **Helmet.js** for secure HTTP headers (HSTS, CSP, X-Frame-Options)
- **Input sanitisation** to strip HTML/scripts from string fields
- **Refresh tokens** — short-lived access tokens (15 min) with a separate refresh token flow

### Performance & Scalability
- **PostgreSQL** instead of SQLite for concurrent access, connection pooling, and replication
- **Pagination** on list endpoints (`?page=1&limit=20`) to avoid returning unbounded result sets
- **Caching** (Redis) for frequently accessed data like account balances

### Code Quality
- **Automated tests** — unit tests for business logic, integration tests for API endpoints (Jest + Supertest)
- **Request logging** with a structured logger like Pino or Winston
- **API versioning strategy** — the `/v1` prefix is there but no mechanism to run v1 and v2 side by side
- **Service layer** — extract business logic out of route handlers into separate service modules for better testability

### Data Integrity
- **Store monetary values as integers** (pence/cents) to avoid floating-point precision issues. £10.99 would be stored as 1099
- **Soft deletes** — mark records as deleted rather than removing them, for audit purposes
