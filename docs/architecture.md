# Architecture Documentation — Self-Hosted SMS Gateway Platform

## System Overview
The SMS Gateway Platform is an end-to-end self-hostable service inspired by Bridge CLI workflows. It turns Android smartphones with cellular SIM cards into programmatic SMS dispatchers, while offering a unified REST API, developer dashboard, OTP generator, broadcast runner, and signed webhook system.

```
+-------------------------------------------------------------+
|               Dashboard / CLI / Customer App                |
+-------------------------------------------------------------+
                              |
                              v [Bearer API Key]
+-------------------------------------------------------------+
|                     REST API (/v1)                          |
|  - Idempotency Engine    - E.164 Validator  - Rate Limiter  |
|  - Opt-Out Suppression   - AES-256 Crypto   - OTP Generator |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|             Database (PostgreSQL / SQLite via Prisma)       |
+-------------------------------------------------------------+
           |                                     |
           v                                     v
+-----------------------+              +-----------------------+
|  Android Device Queue |              |    Webhook Outbox     |
|   (Leasing Watchdog)  |              |   (HMAC Dispatches)   |
+-----------------------+              +-----------------------+
           |                                     |
           v                                     v
 [Android SIM Gateway]                 [Customer HTTP Webhook]
```

## Core Workflows

### 1. Message Queueing & Idempotency
- When an API client calls `POST /v1/messages` with `Idempotency-Key: <key>`, the database unique constraint `[projectId, idempotencyKey]` ensures duplicate calls safely return the existing message record without re-sending.
- Recipient phone is normalized to E.164 (`+91...`).
- The Opt-Out table is checked before persisting.
- The phone number and message body are encrypted at rest using AES-256-GCM.
- An append-only timeline event (`MessageEvent`) is recorded.

### 2. Device Pairing Protocol
1. Dashboard requests pairing session: `POST /v1/devices/pairing-sessions`.
2. Server generates a cryptographically random, 128-bit entropy code, saves the SHA-256 hash, and sets a 10-minute expiry.
3. Dashboard presents a QR code containing `{ apiOrigin, sessionId, code, projectId }`.
4. Handset scans QR code, confirms connection, and exchanges the code via HTTPS (`POST /v1/devices/pair`).
5. Server validates the code atomically in a transaction, consumes the session, and issues a revocable device token `dev_tok_...`.

### 3. Job Leasing Protocol
- Device polls `GET /v1/devices/:id/jobs`.
- API atomically selects queued messages and sets status `leased` with `leaseExpiresAt = now + 60s`.
- The device receives decrypted phone number and message body, and dispatches via Android `SmsManager`.
- If the device crashes or goes offline before reporting, the background worker recovers stale leases back to `queued`.
- Device reports result via `POST /v1/jobs/:id/result`.

### 4. OTP Verification Engine
- Server generates a crypto-secure 6-digit number.
- Code is hashed using HMAC-SHA256 with a secret server-side pepper (`OTP_PEPPER`).
- Raw code is never stored in plaintext and never logged.
- Verification enforces a 5-attempt limit and 5-minute lifetime. Single-use only.
