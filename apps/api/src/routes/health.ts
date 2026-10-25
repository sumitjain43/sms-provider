import { Router, Request, Response } from 'express';
import { config } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    simulatorMode: config.simulatorMode,
    environment: config.env,
  });
});
