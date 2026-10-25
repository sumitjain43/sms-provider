export const SCOPES = {
  MESSAGES_WRITE: 'messages:write',
  MESSAGES_READ: 'messages:read',
  DEVICES_MANAGE: 'devices:manage',
  WEBHOOKS_MANAGE: 'webhooks:manage',
  OTP_MANAGE: 'otp:manage',
  BROADCASTS_MANAGE: 'broadcasts:manage',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export const MESSAGE_STATUS = {
  QUEUED: 'queued',
  LEASED: 'leased',
  ACCEPTED_BY_DEVICE: 'accepted_by_device',
  SUBMITTED_TO_ANDROID: 'submitted_to_android',
  SENT: 'sent',
  FAILED: 'failed',
  SIMULATED: 'simulated',
} as const;

export type MessageStatus = (typeof MESSAGE_STATUS)[keyof typeof MESSAGE_STATUS];

export const EVENT_TYPES = {
  MESSAGE_QUEUED: 'message.queued',
  MESSAGE_LEASED: 'message.leased',
  MESSAGE_SENT: 'message.sent',
  MESSAGE_FAILED: 'message.failed',
  MESSAGE_SIMULATED: 'message.simulated',
  DEVICE_PAIRED: 'device.paired',
  DEVICE_HEARTBEAT: 'device.heartbeat',
  DEVICE_OFFLINE: 'device.offline',
  OTP_SENT: 'otp.sent',
  OTP_VERIFIED: 'otp.verified',
  OPT_OUT_ADDED: 'opt_out.added',
  OPT_OUT_REMOVED: 'opt_out.removed',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
