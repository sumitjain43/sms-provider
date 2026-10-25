# Build Your Own SMS Gateway 🚀

An end-to-end self-hostable SMS gateway platform inspired by the Bridge CLI workflow.

- 🖥️ **Web Dashboard**: Next.js App Router, Tailwind CSS, live SSE streaming.
- ⚡ **REST API**: Node.js & TypeScript Fastify/Express with API key authentication, scopes, and idempotency keys.
- 📱 **Android SIM Gateway**: Native Kotlin app with Jetpack Compose, foreground worker service, and QR code pairing.
- 🧪 **Virtual Device Simulator**: Built-in CLI and browser simulator for zero-friction local testing without physical phones.
- 🔐 **OTP Engine**: Cryptographically secure 6-digit generation, pepper-hashed storage, rate limits, and timing-safe verification.
- 📢 **Broadcasts & Opt-Outs**: CSV preview dry-runs, E.164 normalization, deduplication, and pre-send opt-out suppression.
- 🔔 **Signed Webhooks**: HMAC-SHA256 signatures (`X-SMSGW-Signature: v1=...`) with exponential backoff retries.

---

## Architecture Overview

```
Web Dashboard / CLI / Customer App
              |
              v [Bearer bk_test_...]
      REST API (Node.js / Express)
              |
              v
     Database (Prisma ORM)
              | \
              v   v
Android Device Worker   Webhook Outbox
              |               |
              v               v
         SMS via SIM    Customer HTTP Webhook
```

---

## Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Initialize Database & Seed Demo Project
```bash
npm run db:push
npm run db:seed
```

### 3. Run Development Stack
To run the API and Background Worker:
```bash
# Terminal 1: Run REST API
npm run dev:api

# Terminal 2: Run Background Lease Watchdog & Webhooks Worker
npm run dev:worker

# Terminal 3: Run Next.js Web Dashboard
npm run dev:dashboard
```

Dashboard will be live at: **http://localhost:3000**  
REST API will be live at: **http://localhost:8080**  
Health check: **http://localhost:8080/health**

---

## Testing with the Built-in Virtual Handset Simulator

You don't need a physical Android device to test the complete lifecycle!

1. Open the dashboard at `http://localhost:3000/devices` and click **"Pair Android Handset"**.
2. Copy the **Session ID** and **Pairing Code**.
3. Run the virtual simulator:
```bash
npm run dev:cli -- simulate -s <SESSION_ID> -c <PAIRING_CODE>
```
4. The virtual handset will connect, send heartbeats, lease messages, simulate SIM cellular transmission, and report results back to the dashboard!

---

## CLI Usage

Configure CLI authentication:
```bash
npx sms-gw login http://localhost:8080 bk_test_demo_secret_key_123456789
```

Queue an SMS:
```bash
npx sms-gw send --to "+919876543210" --message "Order #1042 has shipped"
```

Send & Verify OTP:
```bash
npx sms-gw otp send --phone "+919876543210"
npx sms-gw otp verify --phone "+919876543210" --code "123456"
```

Stream live real-time events:
```bash
npx sms-gw stream
```

---

## Acceptance Verification Checklist

- [x] A test key can authenticate and identify its project (`/v1/whoami`).
- [x] Simulator mode queues and inspects messages without sending live carrier SMS.
- [x] API keys are hashed with SHA-256 at rest, scoped, revocable, and never returned after creation.
- [x] Every endpoint enforces project-level isolation.
- [x] Idempotency keys prevent duplicate message creation.
- [x] Pairing codes expire in 10 minutes, are single-use, and cannot be replayed.
- [x] Device credentials can be revoked remotely from the dashboard.
- [x] OTP codes expire in 5 minutes, are single-use, and enforce 5-attempt limits.
- [x] Opt-outs are strictly checked and suppressed prior to queueing and sending.
- [x] Webhooks are signed with HMAC-SHA256 (`v1=...`), retried with exponential backoff, and auditable.
- [x] Recipient phone numbers and bodies are encrypted at rest with AES-256-GCM and redacted in logs.
