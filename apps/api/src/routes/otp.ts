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
  generateOtp,
  hmacSha256,
  encrypt,
  SCOPES,
  MESSAGE_STATUS,
  EVENT_TYPES,
} from '@sms-gateway/shared';
import { config } from '../config.js';
import { eventBus } from '../events.js';

export const otpRouter = Router();

// Send OTP
otpRouter.post(
  '/send',
  authenticateApiKey,
  requireScope(SCOPES.OTP_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    const { phone, template = 'Your verification code is: {{code}}. Valid for 5 minutes.' } = req.body;

    if (!phone || typeof phone !== 'string') {
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
      // Cooldown check: enforce 30s resend cooldown
      const recentOtp = await prisma.otpVerification.findFirst({
        where: {
          projectId,
          phoneHash,
          createdAt: {
            gt: new Date(Date.now() - 30 * 1000), // 30 seconds ago
          },
        },
      });

      if (recentOtp) {
        res.status(429).json({
          error: 'Rate limit exceeded: Please wait 30 seconds before requesting another code',
          retryAfterSeconds: 30,
        });
        return;
      }

      // Generate 6-digit crypto OTP
      const otpCode = generateOtp();
      const codeHash = hmacSha256(otpCode, config.otpPepper);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Store hashed OTP record
      const verification = await prisma.otpVerification.create({
        data: {
          projectId,
          phoneHash,
          phoneRedacted,
          codeHash,
          expiresAt,
          maxAttempts: 5,
        },
      });

      // Format SMS body
      const smsBody = template.replace('{{code}}', otpCode);
      const toEncrypted = encrypt(normalizedPhone, config.encryptionKey);
      const bodyEncrypted = encrypt(smsBody, config.encryptionKey);

      // Queue SMS message for dispatch
      const message = await prisma.message.create({
        data: {
          projectId,
          toEncrypted,
          toRedacted: phoneRedacted,
          bodyEncrypted,
          status: MESSAGE_STATUS.QUEUED,
          idempotencyKey: `otp_${verification.id}`,
        },
      });

      await prisma.messageEvent.create({
        data: {
          messageId: message.id,
          type: MESSAGE_STATUS.QUEUED,
          metadata: JSON.stringify({ reason: 'otp_verification', verificationId: verification.id }),
        },
      });

      eventBus.broadcast({
        id: crypto.randomUUID(),
        projectId,
        type: EVENT_TYPES.OTP_SENT,
        payload: {
          verificationId: verification.id,
          phoneRedacted,
          expiresAt: expiresAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
      });

      // Auto-simulate if simulator mode is active
      if (config.simulatorMode) {
        setTimeout(async () => {
          try {
            await prisma.message.update({
              where: { id: message.id },
              data: { status: MESSAGE_STATUS.SIMULATED },
            });
          } catch {}
        }, 500);
      }

      res.status(200).json({
        verificationId: verification.id,
        phone: phoneRedacted,
        expiresAt: expiresAt.toISOString(),
        simulated: config.simulatorMode,
        // In local development / simulator mode, return code to facilitate testing
        code: config.simulatorMode ? otpCode : undefined,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Verify OTP
otpRouter.post(
  '/verify',
  authenticateApiKey,
  requireScope(SCOPES.OTP_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    const { phone, code } = req.body;

    if (!phone || !code) {
      res.status(400).json({ error: 'Phone and 6-digit code are required' });
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
    const submittedCodeHash = hmacSha256(String(code).trim(), config.otpPepper);

    try {
      // Find latest unverified OTP for this phone
      const record = await prisma.otpVerification.findFirst({
        where: {
          projectId,
          phoneHash,
          verifiedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!record) {
        res.status(400).json({ verified: false, error: 'No active OTP verification found for this number' });
        return;
      }

      if (new Date() > record.expiresAt) {
        res.status(400).json({ verified: false, error: 'OTP has expired. Please request a new code.' });
        return;
      }

      if (record.attempts >= record.maxAttempts) {
        res.status(429).json({
          verified: false,
          error: 'Maximum verification attempts exceeded. Please request a new code.',
        });
        return;
      }

      // Check code equality using crypto timing-safe comparison
      const match = crypto.timingSafeEqual(
        Buffer.from(record.codeHash),
        Buffer.from(submittedCodeHash)
      );

      if (!match) {
        await prisma.otpVerification.update({
          where: { id: record.id },
          data: { attempts: { increment: 1 } },
        });
        const remaining = record.maxAttempts - (record.attempts + 1);
        res.status(400).json({
          verified: false,
          error: `Invalid code. ${remaining} attempts remaining.`,
          attemptsRemaining: remaining,
        });
        return;
      }

      // Code matched! Mark verified atomically and invalidate code
      await prisma.otpVerification.update({
        where: { id: record.id },
        data: {
          verifiedAt: new Date(),
        },
      });

      eventBus.broadcast({
        id: crypto.randomUUID(),
        projectId,
        type: EVENT_TYPES.OTP_VERIFIED,
        payload: {
          verificationId: record.id,
          phoneRedacted: record.phoneRedacted,
          verifiedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });

      res.status(200).json({
        verified: true,
        message: 'Phone number verified successfully',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
