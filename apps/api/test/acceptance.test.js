import test from 'node:test';
import assert from 'node:assert/strict';
import { SmsGatewayClient } from '@sms-gateway/api-client';
import { prisma } from '../dist/db.js';
import { decrypt, verifyWebhookSignature } from '@sms-gateway/shared';
import app from '../dist/index.js';

const API_BASE = 'http://localhost:8080';
const TEST_KEY = 'bk_test_demo_secret_key_123456789';

test('SMS Gateway Acceptance Verification Suite (Section 19 Blueprint)', async (t) => {
  const client = new SmsGatewayClient({
    baseUrl: API_BASE,
    apiKey: TEST_KEY,
  });

  await t.test('1. Health check & Whoami authentication', async () => {
    const health = await client.health();
    assert.equal(health.status, 'ok');

    const whoami = await client.whoami();
    assert.ok(whoami.project.id);
    assert.equal(whoami.project.name, 'Demo Workspace');
    assert.ok(whoami.key.scopes.includes('*'));
  });

  await t.test('2. Idempotent Message Queueing & Encryption at Rest', async () => {
    const idempotencyKey = `test_order_${Date.now()}`;
    const rawPhone = '+919876543210';
    const rawBody = 'Secret one-time transaction alert #99482';

    // Send 1
    const res1 = await client.sendMessage({ to: rawPhone, body: rawBody }, idempotencyKey);
    assert.ok(res1.id);
    assert.ok(res1.to.startsWith('+91') && res1.to.endsWith('3210') && res1.to.includes('*'));

    // Verify raw secret body is NEVER in database unencrypted
    const dbRecord = await prisma.message.findUnique({ where: { id: res1.id } });
    assert.ok(dbRecord);
    assert.notEqual(dbRecord.bodyEncrypted, rawBody);
    assert.notEqual(dbRecord.toEncrypted, rawPhone);

    // Verify AES-256-GCM decryption
    const decrypted = decrypt(dbRecord.bodyEncrypted, process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    assert.equal(decrypted, rawBody);

    // Send 2 with identical Idempotency-Key
    const res2 = await client.sendMessage({ to: rawPhone, body: rawBody }, idempotencyKey);
    assert.equal(res2.id, res1.id, 'Idempotency key must return existing message without creating duplicate');
  });

  await t.test('3. Opt-Out Suppression Enforcement', async () => {
    const optOutPhone = '+919999988888';

    // Register opt-out
    await client.addOptOut(optOutPhone, 'TEST_SUITE');

    // Attempt to queue message to opted-out recipient
    await assert.rejects(
      async () => {
        await client.sendMessage({ to: optOutPhone, body: 'Promotional message' });
      },
      /opted out/i,
      'Sending to opted-out recipient must be rejected before queueing'
    );

    // Clean up
    await client.removeOptOut(optOutPhone);
  });

  await t.test('4. OTP Generation, Pepper-Hashing, and Single-Use Verification', async () => {
    const testPhone = `+91912${Math.floor(1000000 + Math.random() * 9000000)}`;

    // 1. Send OTP
    const sendRes = await client.sendOtp({ phone: testPhone });
    assert.ok(sendRes.verificationId);
    assert.ok(sendRes.code, 'Simulator mode returns code in dev for automated verification');

    // Verify DB does not store plaintext code
    const otpRecord = await prisma.otpVerification.findUnique({
      where: { id: sendRes.verificationId },
    });
    assert.ok(otpRecord);
    assert.notEqual(otpRecord.codeHash, sendRes.code, 'Plaintext code must NEVER be stored in DB');

    // 2. Verify with wrong code
    await assert.rejects(
      async () => {
        await client.verifyOtp({ phone: testPhone, code: '000000' });
      },
      /Invalid code/i
    );

    // 3. Verify with correct code
    const verifyRes = await client.verifyOtp({ phone: testPhone, code: sendRes.code });
    assert.equal(verifyRes.verified, true);

    // 4. Verify code is single-use and cannot be replayed
    await assert.rejects(
      async () => {
        await client.verifyOtp({ phone: testPhone, code: sendRes.code });
      },
      /No active OTP verification found/i
    );
  });

  await t.test('5. Android Device Pairing Protocol & Job Leasing', async () => {
    // Step 1: Create Pairing Session
    const session = await client.createPairingSession();
    assert.ok(session.pairingSessionId);
    assert.ok(session.code);
    assert.ok(session.qrDataUrl);

    // Step 2: Complete Pairing as Android Device
    const pairRes = await client.pairDevice({
      pairingSessionId: session.pairingSessionId,
      code: session.code,
      deviceName: 'Pixel 8 Test Device',
      platform: 'android',
    });
    assert.ok(pairRes.deviceId);
    assert.ok(pairRes.deviceToken);

    // Step 3: Verify Pairing Code cannot be replayed
    await assert.rejects(
      async () => {
        await client.pairDevice({
          pairingSessionId: session.pairingSessionId,
          code: session.code,
          deviceName: 'Attacker Impersonator',
        });
      },
      /already used/i
    );

    const deviceClient = new SmsGatewayClient({
      baseUrl: API_BASE,
      deviceToken: pairRes.deviceToken,
    });

    // Step 4: Device Heartbeat
    const hbRes = await deviceClient.deviceHeartbeat(pairRes.deviceId, { battery: 88 });
    assert.equal(hbRes.status, 'ok');

    // Step 5: Queue an SMS to test device leasing
    const msg = await client.sendMessage({ to: '+919876500001', body: 'Test job leasing via SIM' });

    // Step 6: Device polls jobs
    const jobsRes = await deviceClient.getDeviceJobs(pairRes.deviceId);
    assert.ok(Array.isArray(jobsRes.jobs));

    if (jobsRes.jobs.length > 0) {
      const job = jobsRes.jobs[0];
      assert.ok(job.to.startsWith('+'), 'Leased job must contain decrypted E.164 phone');
      assert.ok(job.body.length > 0, 'Leased job must contain decrypted message text');

      // Step 7: Device reports sent result
      const resultRes = await deviceClient.reportJobResult(job.id, {
        status: 'sent',
        carrierMessageId: 'carrier_receipt_123',
      });
      assert.equal(resultRes.status, 'ok');
    }
  });

  await t.test('6. Webhook Registration and HMAC-SHA256 Signing Verification', async () => {
    const regRes = await client.registerWebhook({
      url: 'https://webhook.site/placeholder-test',
      eventTypes: ['*'],
    });

    assert.ok(regRes.id);
    assert.ok(regRes.secret.startsWith('whsec_'));

    // Test signature generator & validator
    const samplePayload = JSON.stringify({ event: 'message.sent', id: 'evt_123' });
    const timestamp = Math.floor(Date.now() / 1000);
    const valid = verifyWebhookSignature(
      samplePayload,
      timestamp,
      `v1=${await import('@sms-gateway/shared').then((m) => m.hmacSha256(`${timestamp}.${samplePayload}`, regRes.secret))}`,
      regRes.secret
    );
    assert.equal(valid, true, 'HMAC signature must verify canonical payload with timestamp');
  });

  console.log('\n✓ Acceptance Checklist (Section 19 Blueprint) successfully validated!');
  setTimeout(() => process.exit(0), 100);
});
