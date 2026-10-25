import dotenv from 'dotenv';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { decrypt, signWebhookPayload } from '@sms-gateway/shared';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const prisma = new PrismaClient();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

console.log('[Worker] SMS Gateway Background Dispatcher & Webhook Delivery Service starting...');

/**
 * Recovers stale leased jobs where the device failed to report a result before the lease expired.
 */
async function recoverStaleLeases() {
  const now = new Date();
  try {
    const staleMessages = await prisma.message.findMany({
      where: {
        status: 'leased',
        leaseExpiresAt: { lt: now },
      },
      take: 20,
    });

    for (const msg of staleMessages) {
      console.log(`[Worker] Recovering expired lease for message: ${msg.id}`);
      await prisma.message.update({
        where: { id: msg.id },
        data: {
          status: 'queued',
          leaseExpiresAt: null,
          deviceId: null,
        },
      });

      await prisma.messageEvent.create({
        data: {
          messageId: msg.id,
          type: 'lease_expired',
          metadata: JSON.stringify({ reason: 'device_lease_timeout_recovered' }),
        },
      });
    }
  } catch (err: any) {
    console.error('[Worker] Error recovering stale leases:', err.message);
  }
}

/**
 * Dispatches pending webhooks with HMAC-SHA256 signatures and exponential backoff.
 */
async function processPendingWebhooks() {
  const now = new Date();
  try {
    const pendingDeliveries = await prisma.webhookDelivery.findMany({
      where: {
        status: 'pending',
        OR: [
          { nextAttemptAt: null },
          { nextAttemptAt: { lte: now } },
        ],
      },
      include: {
        endpoint: true,
      },
      take: 10,
    });

    for (const delivery of pendingDeliveries) {
      if (!delivery.endpoint || !delivery.endpoint.enabled) {
        continue;
      }

      const secret = decrypt(delivery.endpoint.secretEncrypted, ENCRYPTION_KEY);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signWebhookPayload(delivery.payload, timestamp, secret);

      let success = false;
      let statusCode = 0;
      let errorMsg: string | null = null;

      try {
        const response = await fetch(delivery.endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-SMSGW-Event': delivery.eventType,
            'X-SMSGW-Event-Id': delivery.eventId,
            'X-SMSGW-Timestamp': String(timestamp),
            'X-SMSGW-Signature': signature,
          },
          body: delivery.payload,
          signal: AbortSignal.timeout(6000),
        });

        statusCode = response.status;
        success = response.ok;
      } catch (e: any) {
        errorMsg = e.message;
      }

      const attempts = delivery.attempts + 1;
      const maxAttempts = 5;

      if (success) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'delivered',
            attempts,
            lastStatusCode: statusCode,
            lastError: null,
            nextAttemptAt: null,
          },
        });
        console.log(`[Worker] Webhook delivery ${delivery.id} delivered successfully.`);
      } else if (attempts >= maxAttempts) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'failed',
            attempts,
            lastStatusCode: statusCode || null,
            lastError: errorMsg || `HTTP ${statusCode}`,
            nextAttemptAt: null,
          },
        });
        console.log(`[Worker] Webhook delivery ${delivery.id} failed after max attempts.`);
      } else {
        // Exponential backoff: 5s, 20s, 80s, 320s
        const backoffSeconds = Math.pow(4, attempts) * 5;
        const nextAttempt = new Date(Date.now() + backoffSeconds * 1000);

        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            attempts,
            lastStatusCode: statusCode || null,
            lastError: errorMsg || `HTTP ${statusCode}`,
            nextAttemptAt: nextAttempt,
          },
        });
        console.log(`[Worker] Webhook delivery ${delivery.id} scheduled retry #${attempts} at ${nextAttempt.toISOString()}`);
      }
    }
  } catch (err: any) {
    console.error('[Worker] Error processing webhooks:', err.message);
  }
}

// Start recurring loops
setInterval(recoverStaleLeases, 10000);
setInterval(processPendingWebhooks, 5000);

console.log('[Worker] Lease watchdog running (10s interval)');
console.log('[Worker] Webhook retry processor running (5s interval)');
