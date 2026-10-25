import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateApiKey } from '../middleware/auth.js';
import { prisma } from '../db.js';
import { generateApiKey } from '@sms-gateway/shared';

export const projectsRouter = Router();

// List projects
projectsRouter.get('/', authenticateApiKey, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            devices: true,
            messages: true,
            apiKeys: true,
          },
        },
      },
    });
    res.json({ projects });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create project
projectsRouter.post('/', authenticateApiKey, async (req: AuthenticatedRequest, res: Response) => {
  const { name, environment = 'development' } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'Project name is required' });
    return;
  }

  try {
    const project = await prisma.project.create({
      data: {
        name,
        environment,
      },
    });

    // Auto-create initial API key for convenience
    const keyData = generateApiKey(environment as any);
    await prisma.apiKey.create({
      data: {
        projectId: project.id,
        name: 'Default Key',
        prefix: keyData.prefix,
        hashedSecret: keyData.hashedSecret,
        scopes: JSON.stringify(['*']),
      },
    });

    res.status(201).json({
      project,
      initialApiKey: keyData.rawKey,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List API keys for current project
projectsRouter.get('/api-keys', authenticateApiKey, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { projectId: req.project!.id },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ keys });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create new API key
projectsRouter.post('/api-keys', authenticateApiKey, async (req: AuthenticatedRequest, res: Response) => {
  const { name = 'New Key', scopes = ['*'] } = req.body;

  try {
    const env = (req.project?.environment || 'development') as 'development' | 'production';
    const keyData = generateApiKey(env);

    const apiKey = await prisma.apiKey.create({
      data: {
        projectId: req.project!.id,
        name,
        prefix: keyData.prefix,
        hashedSecret: keyData.hashedSecret,
        scopes: JSON.stringify(Array.isArray(scopes) ? scopes : [scopes]),
      },
    });

    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      secret: keyData.rawKey, // Shown once
      note: 'Save this API key now. You will not be able to see it again.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Revoke API key
projectsRouter.post('/api-keys/:id/revoke', authenticateApiKey, async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;

  try {
    const updated = await prisma.apiKey.updateMany({
      where: {
        id,
        projectId: req.project!.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    res.json({ message: 'API key successfully revoked' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
