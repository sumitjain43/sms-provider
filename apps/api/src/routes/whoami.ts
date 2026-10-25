import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateApiKey } from '../middleware/auth.js';

export const whoamiRouter = Router();

whoamiRouter.get('/', authenticateApiKey, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    project: req.project,
    key: {
      id: req.apiKey?.id,
      name: req.apiKey?.name,
      prefix: req.apiKey?.prefix,
      scopes: req.apiKey?.scopes,
    },
  });
});
