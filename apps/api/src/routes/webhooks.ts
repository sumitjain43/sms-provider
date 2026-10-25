import { Router, Response } from 'express';
import crypto from 'node:crypto';
import {
  AuthenticatedRequest,
  authenticateApiKey,
  requireScope,
} from '../middleware/auth.js';
import { prisma } from '../db.js';
import {
  encrypt,
  decrypt,
  signWebhookPayload,
  SCOPES,
} from '@sms-gateway/shared';
import { config } from '../config.js';

export const webhooksRouter = Router();

// Register Webhook Endpoint
webhooksRouter.post(
  '/',
  authenticateApiKey,
  requireScope(SCOPES.WEBHOOKS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    const { url, eventTypes = ['*'] } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Webhook URL is required' });
      return;
    }

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        res.status(400).json({ error: 'Webhook URL must use http or https protocol' });
        return;
      }
    } catch {
      res.status(400).json({ error: 'Invalid URL format' });
      return;
    }

    const rawSecret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
    const secretEncrypted = encrypt(rawSecret, config.encryptionKey);

    try {
      const endpoint = await prisma.webhookEndpoint.create({
        data: {
          projectId: req.project!.id,
          url,
          secretEncrypted,
          eventTypes: JSON.stringify(Array.isArray(eventTypes) ? eventTypes : [eventTypes]),
        },
      });

      res.status(201).json({
        id: endpoint.id,
        url: endpoint.url,
        eventTypes: JSON.parse(endpoint.eventTypes),
        secret: rawSecret,
        note: 'Save this webhook secret to verify HMAC-SHA256 signatures.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// List Webhooks
webhooksRouter.get(
  '/',
  authenticateApiKey,
  requireScope(SCOPES.WEBHOOKS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const endpoints = await prisma.webhookEndpoint.findMany({
        where: { projectId: req.project!.id },
        include: {
          deliveries: {
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      res.json({
        endpoints: endpoints.map((ep) => ({
          id: ep.id,
          url: ep.url,
          enabled: ep.enabled,
          eventTypes: JSON.parse(ep.eventTypes),
          createdAt: ep.createdAt,
          recentDeliveries: ep.deliveries,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Test Webhook Dispatch
webhooksRouter.post(
  '/:id/test',
  authenticateApiKey,
  requireScope(SCOPES.WEBHOOKS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id as string;

    try {
      const endpoint = await prisma.webhookEndpoint.findFirst({
        where: { id, projectId: req.project!.id },
      });

      if (!endpoint) {
        res.status(404).json({ error: 'Webhook endpoint not found' });
        return;
      }

      const secret = decrypt(endpoint.secretEncrypted, config.encryptionKey);
      const timestamp = Math.floor(Date.now() / 1000);
      const eventId = `evt_${crypto.randomBytes(12).toString('hex')}`;
      const payloadObj = {
        id: eventId,
        type: 'test.ping',
        createdAt: new Date().toISOString(),
        data: { message: 'Test webhook ping from SMS Gateway' },
      };
      const payloadString = JSON.stringify(payloadObj);
      const signature = signWebhookPayload(payloadString, timestamp, secret);

      let statusCode = 0;
      let error: string | null = null;
      let success = false;

      try {
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-SMSGW-Event': 'test.ping',
            'X-SMSGW-Event-Id': eventId,
            'X-SMSGW-Timestamp': String(timestamp),
            'X-SMSGW-Signature': signature,
          },
          body: payloadString,
          signal: AbortSignal.timeout(5000),
        });

        statusCode = response.status;
        success = response.ok;
      } catch (e: any) {
        error = e.message;
      }

      const delivery = await prisma.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          eventId,
          eventType: 'test.ping',
          payload: payloadString,
          attempts: 1,
          status: success ? 'delivered' : 'failed',
          lastStatusCode: statusCode || null,
          lastError: error,
        },
      });

      res.json({
        success,
        deliveryId: delivery.id,
        statusCode,
        error,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
