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
  encrypt,
  SCOPES,
  MESSAGE_STATUS,
} from '@sms-gateway/shared';
import { config } from '../config.js';

export const broadcastsRouter = Router();

// Dry-run preview for CSV broadcast
broadcastsRouter.post(
  '/preview',
  authenticateApiKey,
  requireScope(SCOPES.BROADCASTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    const { recipients = [], bodyTemplate = '' } = req.body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: 'Recipients must be a non-empty array' });
      return;
    }

    const projectId = req.project!.id;
    const valid: Array<{ phone: string; redacted: string }> = [];
    const duplicates: string[] = [];
    const invalid: Array<{ input: string; reason: string }> = [];
    const optedOut: string[] = [];
    const seen = new Set<string>();

    // Fetch existing opt-outs for this project
    const existingOptOuts = await prisma.optOut.findMany({
      where: { projectId },
      select: { phoneHash: true },
    });
    const optOutSet = new Set(existingOptOuts.map((o) => o.phoneHash));

    for (const item of recipients) {
      const raw = typeof item === 'string' ? item : item.phone;
      if (!raw) {
        invalid.push({ input: String(raw), reason: 'Empty phone number' });
        continue;
      }

      let normalized: string;
      try {
        normalized = normalizeE164(raw);
      } catch (err: any) {
        invalid.push({ input: raw, reason: err.message });
        continue;
      }

      if (seen.has(normalized)) {
        duplicates.push(raw);
        continue;
      }
      seen.add(normalized);

      const phoneHash = hmacSha256(normalized, config.otpPepper);
      if (optOutSet.has(phoneHash)) {
        optedOut.push(redactPhone(normalized));
        continue;
      }

      valid.push({
        phone: normalized,
        redacted: redactPhone(normalized),
      });
    }

    res.json({
      summary: {
        totalRows: recipients.length,
        eligible: valid.length,
        duplicates: duplicates.length,
        invalid: invalid.length,
        optedOut: optedOut.length,
      },
      previewSample: valid.slice(0, 5),
      issues: {
        invalid: invalid.slice(0, 10),
        optedOut: optedOut.slice(0, 10),
      },
    });
  }
);

// Create and launch broadcast
broadcastsRouter.post(
  '/',
  authenticateApiKey,
  requireScope(SCOPES.BROADCASTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, recipients = [], bodyTemplate } = req.body;

    if (!name || !bodyTemplate) {
      res.status(400).json({ error: 'Name and bodyTemplate are required' });
      return;
    }

    const projectId = req.project!.id;

    // Filter opt-outs and normalize
    const existingOptOuts = await prisma.optOut.findMany({
      where: { projectId },
      select: { phoneHash: true },
    });
    const optOutSet = new Set(existingOptOuts.map((o) => o.phoneHash));

    const eligibleNumbers: string[] = [];
    const seen = new Set<string>();

    for (const item of recipients) {
      const raw = typeof item === 'string' ? item : item.phone;
      if (!raw) continue;
      try {
        const normalized = normalizeE164(raw);
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        const phoneHash = hmacSha256(normalized, config.otpPepper);
        if (optOutSet.has(phoneHash)) continue;

        eligibleNumbers.push(normalized);
      } catch {}
    }

    try {
      const broadcast = await prisma.broadcast.create({
        data: {
          projectId,
          name,
          status: 'processing',
          totalCount: eligibleNumbers.length,
        },
      });

      // Queue messages in background
      (async () => {
        let sentCount = 0;
        let failedCount = 0;

        for (const phone of eligibleNumbers) {
          try {
            const toEncrypted = encrypt(phone, config.encryptionKey);
            const bodyEncrypted = encrypt(bodyTemplate, config.encryptionKey);
            const toRedacted = redactPhone(phone);

            const msg = await prisma.message.create({
              data: {
                projectId,
                toEncrypted,
                toRedacted,
                bodyEncrypted,
                status: MESSAGE_STATUS.QUEUED,
                idempotencyKey: `bcast_${broadcast.id}_${phone}`,
              },
            });

            await prisma.messageEvent.create({
              data: {
                messageId: msg.id,
                type: MESSAGE_STATUS.QUEUED,
                metadata: JSON.stringify({ broadcastId: broadcast.id }),
              },
            });

            if (config.simulatorMode) {
              await prisma.message.update({
                where: { id: msg.id },
                data: { status: MESSAGE_STATUS.SIMULATED },
              });
            }

            sentCount++;
          } catch (e) {
            failedCount++;
          }
        }

        await prisma.broadcast.update({
          where: { id: broadcast.id },
          data: {
            status: 'completed',
            sentCount,
            failedCount,
          },
        });
      })();

      res.status(201).json({
        id: broadcast.id,
        name: broadcast.name,
        status: 'processing',
        totalRecipients: eligibleNumbers.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// List broadcasts
broadcastsRouter.get(
  '/',
  authenticateApiKey,
  requireScope(SCOPES.BROADCASTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const list = await prisma.broadcast.findMany({
        where: { projectId: req.project!.id },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ broadcasts: list });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
