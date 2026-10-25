import {
  QueueMessageRequest,
  QueueMessageResponse,
  OtpSendRequest,
  OtpSendResponse,
  OtpVerifyRequest,
  OtpVerifyResponse,
  CreatePairingSessionResponse,
  PairDeviceRequest,
  PairDeviceResponse,
  DeviceHeartbeatRequest,
  DeviceJob,
  JobResultRequest,
  WhoamiResponse,
  BroadcastCreateRequest,
  WebhookRegisterRequest,
} from '@sms-gateway/shared';

export interface ClientOptions {
  baseUrl: string;
  apiKey?: string;
  deviceToken?: string;
}

export class SmsGatewayClient {
  private baseUrl: string;
  private apiKey?: string;
  private deviceToken?: string;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.deviceToken = options.deviceToken;
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: any;
      headers?: Record<string, string>;
      idempotencyKey?: string;
      useDeviceToken?: boolean;
    } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (options.useDeviceToken && this.deviceToken) {
      headers['Authorization'] = `Bearer ${this.deviceToken}`;
    } else if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP error ${response.status}: ${response.statusText}`);
    }

    return data as T;
  }

  // Health
  async health(): Promise<{ status: string; uptime: number; timestamp: string }> {
    return this.request('/health');
  }

  // Auth / Whoami
  async whoami(): Promise<WhoamiResponse> {
    return this.request('/v1/whoami');
  }

  // Messages
  async sendMessage(
    req: QueueMessageRequest,
    idempotencyKey?: string
  ): Promise<QueueMessageResponse> {
    return this.request('/v1/messages', {
      method: 'POST',
      body: req,
      idempotencyKey,
    });
  }

  async listMessages(params: { limit?: number; page?: number; status?: string } = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.page) query.set('page', String(params.page));
    if (params.status) query.set('status', params.status);
    return this.request(`/v1/messages?${query.toString()}`);
  }

  async getMessage(id: string): Promise<any> {
    return this.request(`/v1/messages/${id}`);
  }

  // OTP
  async sendOtp(req: OtpSendRequest): Promise<OtpSendResponse> {
    return this.request('/v1/otp/send', {
      method: 'POST',
      body: req,
    });
  }

  async verifyOtp(req: OtpVerifyRequest): Promise<OtpVerifyResponse> {
    return this.request('/v1/otp/verify', {
      method: 'POST',
      body: req,
    });
  }

  // Devices & Pairing
  async createPairingSession(): Promise<CreatePairingSessionResponse> {
    return this.request('/v1/devices/pairing-sessions', {
      method: 'POST',
    });
  }

  async pairDevice(req: PairDeviceRequest): Promise<PairDeviceResponse> {
    return this.request('/v1/devices/pair', {
      method: 'POST',
      body: req,
    });
  }

  async listDevices(): Promise<any> {
    return this.request('/v1/devices');
  }

  async deviceHeartbeat(
    deviceId: string,
    stats: DeviceHeartbeatRequest = {}
  ): Promise<{ status: string }> {
    return this.request(`/v1/devices/${deviceId}/heartbeat`, {
      method: 'POST',
      body: stats,
      useDeviceToken: true,
    });
  }

  async getDeviceJobs(deviceId: string): Promise<{ jobs: DeviceJob[] }> {
    return this.request(`/v1/devices/${deviceId}/jobs`, {
      method: 'GET',
      useDeviceToken: true,
    });
  }

  async reportJobResult(
    jobId: string,
    result: JobResultRequest
  ): Promise<{ status: string; messageId: string }> {
    return this.request(`/v1/jobs/${jobId}/result`, {
      method: 'POST',
      body: result,
      useDeviceToken: true,
    });
  }

  // Opt-outs
  async listOptOuts(): Promise<any> {
    return this.request('/v1/opt-outs');
  }

  async addOptOut(phone: string, source = 'API'): Promise<any> {
    return this.request('/v1/opt-outs', {
      method: 'POST',
      body: { phone, source },
    });
  }

  async removeOptOut(phone: string): Promise<any> {
    return this.request(`/v1/opt-outs/${encodeURIComponent(phone)}`, {
      method: 'DELETE',
    });
  }

  // Broadcasts
  async createBroadcast(req: BroadcastCreateRequest): Promise<any> {
    return this.request('/v1/broadcasts', {
      method: 'POST',
      body: req,
    });
  }

  async listBroadcasts(): Promise<any> {
    return this.request('/v1/broadcasts');
  }

  // Webhooks
  async registerWebhook(req: WebhookRegisterRequest): Promise<any> {
    return this.request('/v1/webhooks', {
      method: 'POST',
      body: req,
    });
  }

  async listWebhooks(): Promise<any> {
    return this.request('/v1/webhooks');
  }
}
