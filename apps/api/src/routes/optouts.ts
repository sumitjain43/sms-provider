import { Router, Response } from 'express';
import {
  AuthenticatedRequest,
  authenticateApiKey,
  requireScope,
} from '../middleware/auth.js';
import { prisma } from '../db.js';
import {
  normalizeE164,
  redactPhone,
  hmacSha256,
  SCOPES,
  EVENT_TYPES,
} from '@sms-gateway/shared';
import { config } from '../config.js';
import { eventBus } from '../events.js';
import crypto from 'node:crypto';

export const optOutsRouter = Router();

// List opt-outs
optOutsRouter.get(
  '/',
  authenticateApiKey,
  requireScope(SCOPES.MESSAGES_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const records = await prisma.optOut.findMany({
        where: { projectId: req.project!.id },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        optOuts: records.map((r) => ({
          id: r.id,
          phoneRedacted: r.phoneRedacted,
          source: r.source,
          createdAt: r.createdAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Add an opt-out
optOutsRouter.post(
  '/',
  authenticateApiKey,
  requireScope(SCOPES.MESSAGES_WRITE),
  async (req: AuthenticatedRequest, res: Response) => {
    const { phone, source = 'API' } = req.body;

    if (!phone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeE164(phone);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }

    const projectId = req.project!.id;
    const phoneHash = hmacSha256(normalizedPhone, config.otpPepper);
    const phoneRedacted = redactPhone(normalizedPhone);

    try {
      const optOut = await prisma.optOut.upsert({
        where: {
          projectId_phoneHash: {
            projectId,
            phoneHash,
          },
        },
        create: {
          projectId,
          phoneHash,
          phoneRedacted,
          source,
        },
        update: {
          source,
        },
      });

      eventBus.broadcast({
        id: crypto.randomUUID(),
        projectId,
        type: EVENT_TYPES.OPT_OUT_ADDED,
        payload: { phoneRedacted, source },
        timestamp: new Date().toISOString(),
      });

      res.status(201).json({
        id: optOut.id,
        phone: phoneRedacted,
        source: optOut.source,
        createdAt: optOut.createdAt,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Remove an opt-out (resubscribe)
optOutsRouter.delete(
  '/:phone',
  authenticateApiKey,
  requireScope(SCOPES.MESSAGES_WRITE),
  async (req: AuthenticatedRequest, res: Response) => {
    const phone = req.params.phone as string;

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeE164(phone);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }

    const projectId = req.project!.id;
    const phoneHash = hmacSha256(normalizedPhone, config.otpPepper);

    try {
      await prisma.optOut.deleteMany({
        where: {
          projectId,
          phoneHash,
        },
      });

      res.json({ message: 'Opt-out removed successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
