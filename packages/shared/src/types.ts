import { MessageStatus, Scope } from './constants.js';

export interface WhoamiResponse {
  project: {
    id: string;
    name: string;
    environment: string;
  };
  key: {
    id: string;
    name: string;
    prefix: string;
    scopes: Scope[];
  };
}

export interface QueueMessageRequest {
  to: string;
  body: string;
}

export interface QueueMessageResponse {
  id: string;
  status: MessageStatus;
  to: string; // Redacted
  createdAt: string;
  simulated?: boolean;
}

export interface OtpSendRequest {
  phone: string;
  template?: string; // Optional template e.g. "Your verification code is {{code}}"
}

export interface OtpSendResponse {
  verificationId: string;
  phone: string; // Redacted
  expiresAt: string;
  simulated?: boolean;
  code?: string; // Included only in SIMULATOR_MODE / dev for instant testing
}

export interface OtpVerifyRequest {
  phone: string;
  code: string;
}

export interface OtpVerifyResponse {
  verified: boolean;
  message: string;
}

export interface CreatePairingSessionResponse {
  pairingSessionId: string;
  code: string;
  qrPayload: string;
  expiresAt: string;
}

export interface PairDeviceRequest {
  pairingSessionId: string;
  code: string;
  deviceName: string;
  platform?: string;
  capabilities?: Record<string, any>;
}

export interface PairDeviceResponse {
  deviceId: string;
  deviceToken: string;
  deviceName: string;
  projectId: string;
}

export interface DeviceHeartbeatRequest {
  battery?: number;
  isCharging?: boolean;
  simOperator?: string;
  networkType?: string;
}

export interface DeviceJob {
  id: string;
  to: string; // Decrypted E.164 phone
  body: string; // Decrypted message body
  leaseExpiresAt: string;
}

export interface JobResultRequest {
  status: 'sent' | 'failed';
  errorMessage?: string;
  carrierMessageId?: string;
}

export interface BroadcastCreateRequest {
  name: string;
  recipients: Array<{ phone: string }>;
  bodyTemplate: string;
}

export interface WebhookRegisterRequest {
  url: string;
  eventTypes: string[];
}
