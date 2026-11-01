import dotenv from 'dotenv';
import path from 'node:path';

// Load .env from root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.API_PORT || '8080', 10),
  env: process.env.NODE_ENV || 'development',
  apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.API_PORT || 8080}`,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  simulatorMode: process.env.SIMULATOR_MODE === 'true',
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  otpPepper: process.env.OTP_PEPPER || 'dev-otp-pepper-secret-change-in-prod-123456789',
  webhookSigningKey: process.env.WEBHOOK_SIGNING_KEY || 'dev-webhook-secret-change-in-prod-987654321',
  adminSecret: process.env.ADMIN_SECRET || 'dev-admin-secret-key-12345',
};
