# Threat Model & Security Baseline

Based on Section 12 of the SMS Gateway Technical Blueprint:

| Risk | Mitigation Implemented |
|---|---|
| **API Key Theft** | Raw secrets displayed once at creation; stored in database as SHA-256 one-way hashes; supports scoping and instant remote revocation. |
| **Cross-Tenant Access** | Every database query and authorization check enforces `projectId` boundaries. |
| **Duplicate Sends** | Unique index on `[projectId, idempotencyKey]`, atomic database transactions, job leases, and cautious retries. |
| **OTP Abuse / Cost Attacks** | 30s resend cooldown, per-phone and per-IP limits, 5-attempt limit before invalidation, and peppered HMAC hashing. |
| **Webhook SSRF** | Validates URL protocols (`http`/`https`), restricts loopback destinations in production mode. |
| **Data Leakage** | Sensitive phone numbers and message bodies encrypted at rest using AES-256-GCM (`iv:authTag:ciphertext`). Phone numbers redacted in logs and public UI (`+91*****3210`). |
| **Pairing Hijack** | Short 10-minute expiry, single-use consumption in a database transaction, 128-bit random entropy, brute-force attempt limits. |
| **Malicious APK / Evaded Permissions** | Follows native Android `SmsManager` APIs only; transparent runtime permission UI; persistent foreground notification; no accessibility service abuse. |

## Production Security Baseline
1. Never commit `.env` files or hardcoded credentials.
2. Terminate TLS/HTTPS via reverse proxy (Nginx / Cloudflare / Caddy).
3. Set least-privilege API key scopes (`messages:write`, `messages:read`, `devices:manage`, `webhooks:manage`).
4. Ensure backups of database and test restore runbooks.
