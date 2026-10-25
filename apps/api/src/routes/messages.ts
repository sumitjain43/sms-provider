import { Router, Response } from 'express';
import crypto from 'node:crypto';
import {
  AuthenticatedRequest,
  authenticateApiKey,
  requireScope,
} from '../middleware/auth.js';
import { prisma } from '../db.js';
import {
  normalizeE164,
  redactPhone,
  encrypt,
  decrypt,
  hmacSha256,
  SCOPES,
  MESSAGE_STATUS,
  EVENT_TYPES,
} from '@sms-gateway/shared';
import { config } from '../config.js';
import { eventBus } from '../events.js';

export const messagesRouter = Router();

// Queue a new SMS message
messagesRouter.post(
  '/',
  authenticateApiKey,
  requireScope(SCOPES.MESSAGES_WRITE),
  async (req: AuthenticatedRequest, res: Response) => {
    const { to, body } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    if (!to || typeof to !== 'string') {
      res.status(400).json({ error: 'Field "to" is required and must be an E.164 phone number' });
      return;
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      res.status(400).json({ error: 'Field "body" is required and cannot be empty' });
      return;
    }

    // Normalize phone number to E.164
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeE164(to);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }

    const projectId = req.project!.id;

    // Idempotency check: if message already exists with this idempotency key in this project, return it
    if (idempotencyKey) {
      const existing = await prisma.message.findUnique({
        where: {
          projectId_idempotencyKey: {
            projectId,
            idempotencyKey,
          },
        },
      });

      if (existing) {
        res.status(200).json({
          id: existing.id,
          status: existing.status,
          to: existing.toRedacted,
          createdAt: existing.createdAt.toISOString(),
          idempotentReplay: true,
        });
        return;
      }
    }

    // Opt-out check: verify if recipient has opted out
    const phoneHash = hmacSha256(normalizedPhone, config.otpPepper);
    const optOut = await prisma.optOut.findUnique({
      where: {
        projectId_phoneHash: {
          projectId,
          phoneHash,
        },
      },
    });

    if (optOut) {
      res.status(400).json({
        error: 'Recipient has opted out of messages from this project',
        code: 'RECIPIENT_OPTED_OUT',
      });
      return;
    }

    // Encrypt sensitive fields
    const toEncrypted = encrypt(normalizedPhone, config.encryptionKey);
    const bodyEncrypted = encrypt(body, config.encryptionKey);
    const toRedacted = redactPhone(normalizedPhone);

    try {
      const message = await prisma.message.create({
        data: {
          projectId,
          toEncrypted,
          toRedacted,
          bodyEncrypted,
          status: MESSAGE_STATUS.QUEUED,
          idempotencyKey: idempotencyKey || null,
        },
      });

      // Append-only timeline event
      await prisma.messageEvent.create({
        data: {
          messageId: message.id,
          type: MESSAGE_STATUS.QUEUED,
          metadata: JSON.stringify({ toRedacted, bodyLength: body.length }),
        },
      });

      // Broadcast SSE event
      eventBus.broadcast({
        id: crypto.randomUUID(),
        projectId,
        type: EVENT_TYPES.MESSAGE_QUEUED,
        payload: {
          messageId: message.id,
          toRedacted,
          status: MESSAGE_STATUS.QUEUED,
          createdAt: message.createdAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
      });

      // If simulator mode is enabled and there are no active online Android devices, auto-simulate after 800ms
      if (config.simulatorMode) {
        setTimeout(async () => {
          try {
            const current = await prisma.message.findUnique({ where: { id: message.id } });
            if (current && current.status === MESSAGE_STATUS.QUEUED) {
              await prisma.message.update({
                where: { id: message.id },
                data: { status: MESSAGE_STATUS.SIMULATED },
              });
              await prisma.messageEvent.create({
                data: {
                  messageId: message.id,
                  type: MESSAGE_STATUS.SIMULATED,
                  metadata: JSON.stringify({ simulated: true, completedAt: new Date() }),
                },
              });
              eventBus.broadcast({
                id: crypto.randomUUID(),
                projectId,
                type: EVENT_TYPES.MESSAGE_SIMULATED,
                payload: {
                  messageId: message.id,
                  toRedacted,
                  status: MESSAGE_STATUS.SIMULATED,
                },
                timestamp: new Date().toISOString(),
              });
            }
          } catch (e) {
            // Ignore background simulation errors
          }
        }, 800);
      }

      res.status(202).json({
        id: message.id,
        status: message.status,
        to: toRedacted,
        createdAt: message.createdAt.toISOString(),
        simulated: config.simulatorMode,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// List messages (paginated)
messagesRouter.get(
  '/',
  authenticateApiKey,
  requireScope(SCOPES.MESSAGES_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
    const status = req.query.status as string | undefined;

    const where: any = { projectId: req.project!.id };
    if (status) {
      where.status = status;
    }

    try {
      const [total, messages] = await Promise.all([
        prisma.message.count({ where }),
        prisma.message.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            toRedacted: true,
            status: true,
            errorMessage: true,
            idempotencyKey: true,
            deviceId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

      res.json({
        data: messages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Get single message by ID with full event timeline
messagesRouter.get(
  '/:id',
  authenticateApiKey,
  requireScope(SCOPES.MESSAGES_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id as string;

    try {
      const message = await prisma.message.findFirst({
        where: {
          id,
          projectId: req.project!.id,
        },
        include: {
          events: {
            orderBy: { timestamp: 'asc' },
          },
          device: {
            select: { id: true, name: true, platform: true },
          },
        },
      });

      if (!message) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      // Decrypt message body for authorized inspection
      let decryptedBody: string | null = null;
      try {
        decryptedBody = decrypt(message.bodyEncrypted, config.encryptionKey);
      } catch {
        decryptedBody = '[Decryption failed]';
      }

      res.json({
        id: message.id,
        to: message.toRedacted,
        body: decryptedBody,
        status: message.status,
        errorMessage: message.errorMessage,
        idempotencyKey: message.idempotencyKey,
        device: message.device,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        events: message.events.map((e) => ({
          id: e.id,
          type: e.type,
          timestamp: e.timestamp,
          metadata: e.metadata ? JSON.parse(e.metadata) : null,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
