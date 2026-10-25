import { Router, Response } from 'express';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import {
  AuthenticatedRequest,
  authenticateApiKey,
  authenticateDevice,
  requireScope,
} from '../middleware/auth.js';
import { prisma } from '../db.js';
import {
  generatePairingCode,
  sha256,
  decrypt,
  SCOPES,
  MESSAGE_STATUS,
  EVENT_TYPES,
} from '@sms-gateway/shared';
import { config } from '../config.js';
import { eventBus } from '../events.js';

export const devicesRouter = Router();

// Create Pairing Session (Dashboard / API Key authorized)
devicesRouter.post(
  '/pairing-sessions',
  authenticateApiKey,
  requireScope(SCOPES.DEVICES_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const code = generatePairingCode();
      const codeHash = sha256(code);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      const session = await prisma.pairingSession.create({
        data: {
          projectId: req.project!.id,
          codeHash,
          expiresAt,
        },
      });

      const qrPayload = JSON.stringify({
        apiOrigin: config.apiBaseUrl,
        sessionId: session.id,
        code,
        projectId: req.project!.id,
        projectName: req.project!.name,
      });

      const qrDataUrl = await QRCode.toDataURL(qrPayload);

      res.status(201).json({
        pairingSessionId: session.id,
        code,
        qrPayload,
        qrDataUrl,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Complete Pairing (Android Device calls this to claim credentials)
devicesRouter.post('/pair', async (req: AuthenticatedRequest, res: Response) => {
  const { pairingSessionId, code, deviceName = 'Android Device', platform = 'android', capabilities = {} } = req.body;

  if (!pairingSessionId || !code) {
    res.status(400).json({ error: 'pairingSessionId and code are required' });
    return;
  }

  const codeHash = sha256(code);

  try {
    const session = await prisma.pairingSession.findUnique({
      where: { id: pairingSessionId },
    });

    if (!session) {
      res.status(404).json({ error: 'Pairing session not found' });
      return;
    }

    if (session.consumedAt) {
      res.status(400).json({ error: 'Pairing code already used' });
      return;
    }

    if (new Date() > session.expiresAt) {
      res.status(400).json({ error: 'Pairing code expired' });
      return;
    }

    if (session.codeHash !== codeHash) {
      await prisma.pairingSession.update({
        where: { id: pairingSessionId },
        data: { attempts: { increment: 1 } },
      });
      res.status(401).json({ error: 'Invalid pairing code' });
      return;
    }

    // Generate device revocable secret
    const rawDeviceToken = `dev_tok_${crypto.randomBytes(32).toString('hex')}`;
    const secretHash = sha256(rawDeviceToken);

    // Consume session and create device in transaction
    const device = await prisma.$transaction(async (tx) => {
      await tx.pairingSession.update({
        where: { id: pairingSessionId },
        data: { consumedAt: new Date() },
      });

      return tx.device.create({
        data: {
          projectId: session.projectId,
          name: deviceName,
          platform,
          status: 'online',
          lastSeenAt: new Date(),
          capabilities: JSON.stringify(capabilities),
          secretHash,
        },
      });
    });

    eventBus.broadcast({
      id: crypto.randomUUID(),
      projectId: session.projectId,
      type: EVENT_TYPES.DEVICE_PAIRED,
      payload: {
        deviceId: device.id,
        name: device.name,
        platform: device.platform,
      },
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      deviceId: device.id,
      deviceToken: rawDeviceToken,
      deviceName: device.name,
      projectId: session.projectId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List paired devices (Dashboard / API Key authorized)
devicesRouter.get(
  '/',
  authenticateApiKey,
  requireScope(SCOPES.DEVICES_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const devices = await prisma.device.findMany({
        where: {
          projectId: req.project!.id,
          status: { not: 'unpaired' },
        },
        orderBy: { lastSeenAt: 'desc' },
      });

      // Compute online status based on lastSeenAt (e.g. within 60s)
      const now = Date.now();
      const mapped = devices.map((d) => {
        let isOnline = false;
        if (d.lastSeenAt) {
          isOnline = now - new Date(d.lastSeenAt).getTime() < 90_000;
        }
        return {
          id: d.id,
          name: d.name,
          platform: d.platform,
          status: isOnline ? 'online' : 'offline',
          lastSeenAt: d.lastSeenAt,
          capabilities: d.capabilities ? JSON.parse(d.capabilities) : null,
          createdAt: d.createdAt,
        };
      });

      res.json({ devices: mapped });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Device Heartbeat (Called by Android App / Simulator)
devicesRouter.post('/:id/heartbeat', authenticateDevice, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;
  const capabilities = req.body;

  if (req.device?.id !== id) {
    res.status(403).json({ error: 'Device token does not match requested device ID' });
    return;
  }

  try {
    await prisma.device.update({
      where: { id },
      data: {
        status: 'online',
        lastSeenAt: new Date(),
        capabilities: capabilities ? JSON.stringify(capabilities) : undefined,
      },
    });

    res.json({ status: 'ok' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Device polls queued jobs (Leasing protocol)
devicesRouter.get('/:id/jobs', authenticateDevice, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;

  if (req.device?.id !== id) {
    res.status(403).json({ error: 'Device token does not match requested device ID' });
    return;
  }

  try {
    const now = new Date();
    const leaseDurationMs = 60 * 1000; // 60s lease timeout
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    // Atomically find and lease next available message:
    // Either status = 'queued' OR (status = 'leased' AND leaseExpiresAt < now)
    const claimedJob = await prisma.$transaction(async (tx) => {
      const candidate = await tx.message.findFirst({
        where: {
          projectId: req.project!.id,
          OR: [
            { status: MESSAGE_STATUS.QUEUED },
            {
              status: MESSAGE_STATUS.LEASED,
              leaseExpiresAt: { lt: now },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!candidate) return null;

      const updated = await tx.message.update({
        where: { id: candidate.id },
        data: {
          status: MESSAGE_STATUS.LEASED,
          deviceId: id,
          leaseExpiresAt,
        },
      });

      await tx.messageEvent.create({
        data: {
          messageId: updated.id,
          type: MESSAGE_STATUS.LEASED,
          metadata: JSON.stringify({ deviceId: id, leaseExpiresAt }),
        },
      });

      return updated;
    });

    if (!claimedJob) {
      res.json({ jobs: [] });
      return;
    }

    // Decrypt recipient and body
    const to = decrypt(claimedJob.toEncrypted, config.encryptionKey);
    const body = decrypt(claimedJob.bodyEncrypted, config.encryptionKey);

    eventBus.broadcast({
      id: crypto.randomUUID(),
      projectId: req.project!.id,
      type: EVENT_TYPES.MESSAGE_LEASED,
      payload: {
        messageId: claimedJob.id,
        deviceId: id,
        toRedacted: claimedJob.toRedacted,
      },
      timestamp: new Date().toISOString(),
    });

    res.json({
      jobs: [
        {
          id: claimedJob.id,
          to,
          body,
          leaseExpiresAt: leaseExpiresAt.toISOString(),
        },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Device reports job result
devicesRouter.post('/jobs/:id/result', authenticateDevice, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;
  const { status, errorMessage, carrierMessageId } = req.body;

  if (status !== 'sent' && status !== 'failed') {
    res.status(400).json({ error: 'Status must be sent or failed' });
    return;
  }

  try {
    const message = await prisma.message.findFirst({
      where: {
        id,
        deviceId: req.device!.id,
      },
    });

    if (!message) {
      res.status(404).json({ error: 'Job not found or not leased by this device' });
      return;
    }

    const updated = await prisma.message.update({
      where: { id },
      data: {
        status,
        errorMessage: errorMessage || null,
        leaseExpiresAt: null,
      },
    });

    await prisma.messageEvent.create({
      data: {
        messageId: id,
        type: status,
        metadata: JSON.stringify({
          carrierMessageId,
          errorMessage,
          reportedBy: req.device!.name,
        }),
      },
    });

    eventBus.broadcast({
      id: crypto.randomUUID(),
      projectId: req.project!.id,
      type: status === 'sent' ? EVENT_TYPES.MESSAGE_SENT : EVENT_TYPES.MESSAGE_FAILED,
      payload: {
        messageId: id,
        status,
        toRedacted: updated.toRedacted,
        errorMessage,
      },
      timestamp: new Date().toISOString(),
    });

    res.json({ status: 'ok', messageId: id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Unpair device
devicesRouter.post(
  '/:id/unpair',
  authenticateApiKey,
  requireScope(SCOPES.DEVICES_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id as string;

    try {
      await prisma.device.updateMany({
        where: { id, projectId: req.project!.id },
        data: { status: 'unpaired', secretHash: 'revoked' },
      });

      res.json({ message: 'Device unpaired successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
