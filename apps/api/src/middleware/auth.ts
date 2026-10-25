import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db.js';
import { sha256 } from '@sms-gateway/shared';
import { config } from '../config.js';

export interface AuthenticatedRequest extends Request {
  project?: {
    id: string;
    name: string;
    environment: string;
  };
  apiKey?: {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
  };
  device?: {
    id: string;
    name: string;
    platform: string;
  };
}

/**
 * Middleware that authenticates requests using Bearer API Key.
 */
export async function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header. Expected Bearer <api_key>' });
    return;
  }

  const token = authHeader.substring(7).trim();

  // Allow admin master secret for internal dashboard operations
  if (token === config.adminSecret) {
    // Find or create default project
    let project = await prisma.project.findFirst();
    if (!project) {
      project = await prisma.project.create({
        data: {
          name: 'Default Workspace',
          environment: 'development',
        },
      });
    }
    req.project = {
      id: project.id,
      name: project.name,
      environment: project.environment,
    };
    req.apiKey = {
      id: 'admin',
      name: 'Admin Session',
      prefix: 'admin',
      scopes: ['*'],
    };
    return next();
  }

  const hashedSecret = sha256(token);

  try {
    const keyRecord = await prisma.apiKey.findFirst({
      where: {
        hashedSecret,
        revokedAt: null,
      },
      include: {
        project: true,
      },
    });

    if (!keyRecord) {
      res.status(401).json({ error: 'Invalid or revoked API key' });
      return;
    }

    // Parse scopes
    let scopes: string[] = [];
    try {
      scopes = JSON.parse(keyRecord.scopes);
    } catch {
      scopes = keyRecord.scopes.split(',').map((s) => s.trim());
    }

    req.project = {
      id: keyRecord.project.id,
      name: keyRecord.project.name,
      environment: keyRecord.project.environment,
    };
    req.apiKey = {
      id: keyRecord.id,
      name: keyRecord.name,
      prefix: keyRecord.prefix,
      scopes,
    };

    // Update lastUsedAt asynchronously
    prisma.apiKey
      .update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    next();
  } catch (err: any) {
    res.status(500).json({ error: 'Authentication database error' });
  }
}

/**
 * Middleware that authenticates requests coming from an Android Device.
 */
export async function authenticateDevice(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Device token missing or malformed' });
    return;
  }

  const token = authHeader.substring(7).trim();
  const secretHash = sha256(token);

  try {
    const device = await prisma.device.findFirst({
      where: {
        secretHash,
        status: { not: 'unpaired' },
      },
      include: {
        project: true,
      },
    });

    if (!device) {
      res.status(401).json({ error: 'Device token invalid or device has been unpaired' });
      return;
    }

    req.project = {
      id: device.project.id,
      name: device.project.name,
      environment: device.project.environment,
    };
    req.device = {
      id: device.id,
      name: device.name,
      platform: device.platform,
    };

    next();
  } catch (err) {
    res.status(500).json({ error: 'Device authentication error' });
  }
}

/**
 * Scope check helper
 */
export function requireScope(requiredScope: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.apiKey.scopes.includes('*') || req.apiKey.scopes.includes(requiredScope)) {
      return next();
    }

    res.status(403).json({
      error: `Forbidden: API key does not have required scope "${requiredScope}"`,
      requiredScope,
      grantedScopes: req.apiKey.scopes,
    });
  };
}
