import { Command } from 'commander';
import { SmsGatewayClient } from '@sms-gateway/api-client';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_FILE = path.join(os.homedir(), '.smsgwrc.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveConfig(cfg: any) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

const config = loadConfig();
const defaultBaseUrl = process.env.API_BASE_URL || config.baseUrl || 'http://localhost:8080';
const defaultApiKey = process.env.SMS_API_KEY || config.apiKey;

const program = new Command();
program
  .name('sms-gw')
  .description('Bridge-inspired SMS Gateway Command Line Interface')
  .version('1.0.0');

// Login
program
  .command('login')
  .description('Configure API Base URL and API Key for CLI')
  .argument('<baseUrl>', 'API URL e.g. http://localhost:8080')
  .argument('<apiKey>', 'API Key e.g. bk_test_...')
  .action(async (baseUrl, apiKey) => {
    saveConfig({ baseUrl, apiKey });
    console.log(`✓ Configuration saved to ${CONFIG_FILE}`);
    try {
      const client = new SmsGatewayClient({ baseUrl, apiKey });
      const whoami = await client.whoami();
      console.log(`✓ Authenticated as: ${whoami.project.name} (${whoami.project.environment})`);
    } catch (err: any) {
      console.error(`! Warning: Connection test failed: ${err.message}`);
    }
  });

// Whoami
program
  .command('whoami')
  .description('Display identity of current API key and project')
  .action(async () => {
    if (!defaultApiKey) {
      console.error('Error: Not logged in. Run "sms-gw login <url> <apiKey>" or set SMS_API_KEY.');
      process.exit(1);
    }
    const client = new SmsGatewayClient({ baseUrl: defaultBaseUrl, apiKey: defaultApiKey });
    try {
      const who = await client.whoami();
      console.log('\n--- SMS Gateway Session ---');
      console.log(`Project:     ${who.project.name} (ID: ${who.project.id})`);
      console.log(`Environment: ${who.project.environment}`);
      console.log(`Key Name:    ${who.key.name}`);
      console.log(`Key Scopes:  ${who.key.scopes.join(', ')}`);
      console.log('---------------------------\n');
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }
  });

// Send message
program
  .command('send')
  .description('Queue an SMS message')
  .requiredOption('-t, --to <phone>', 'Recipient phone number (e.g. +919876543210)')
  .requiredOption('-m, --message <body>', 'SMS text body')
  .option('-i, --idempotency-key <key>', 'Optional unique idempotency key')
  .action(async (opts) => {
    const client = new SmsGatewayClient({ baseUrl: defaultBaseUrl, apiKey: defaultApiKey });
    try {
      const res = await client.sendMessage(
        { to: opts.to, body: opts.message },
        opts.idempotencyKey
      );
      console.log(`✓ Message Queued!`);
      console.log(`  ID:        ${res.id}`);
      console.log(`  To:        ${res.to}`);
      console.log(`  Status:    ${res.status}`);
      if (res.simulated) {
        console.log(`  Mode:      Simulated (SIMULATOR_MODE=true)`);
      }
    } catch (err: any) {
      console.error(`Error sending message: ${err.message}`);
    }
  });

// List messages
program
  .command('list')
  .description('List recent messages')
  .option('-l, --limit <limit>', 'Limit rows', '10')
  .option('-s, --status <status>', 'Filter by status')
  .action(async (opts) => {
    const client = new SmsGatewayClient({ baseUrl: defaultBaseUrl, apiKey: defaultApiKey });
    try {
      const res = await client.listMessages({
        limit: parseInt(opts.limit, 10),
        status: opts.status,
      });
      console.log(`\nMessages (Total: ${res.pagination.total}):`);
      console.table(
        res.data.map((m: any) => ({
          ID: m.id.slice(0, 8) + '...',
          To: m.toRedacted,
          Status: m.status,
          Created: new Date(m.createdAt).toLocaleTimeString(),
        }))
      );
    } catch (err: any) {
      console.error(`Error listing messages: ${err.message}`);
    }
  });

// OTP subcommands
const otpCommand = program.command('otp').description('OTP generation and verification commands');

otpCommand
  .command('send')
  .description('Send an OTP verification SMS')
  .requiredOption('-p, --phone <phone>', 'Phone number')
  .action(async (opts) => {
    const client = new SmsGatewayClient({ baseUrl: defaultBaseUrl, apiKey: defaultApiKey });
    try {
      const res = await client.sendOtp({ phone: opts.phone });
      console.log(`✓ OTP dispatched to ${res.phone}`);
      console.log(`  Expires at: ${new Date(res.expiresAt).toLocaleTimeString()}`);
      if (res.code) {
        console.log(`  [SIMULATOR CODE]: ${res.code}`);
      }
    } catch (err: any) {
      console.error(`Error sending OTP: ${err.message}`);
    }
  });

otpCommand
  .command('verify')
  .description('Verify an OTP code')
  .requiredOption('-p, --phone <phone>', 'Phone number')
  .requiredOption('-c, --code <code>', '6-digit code')
  .action(async (opts) => {
    const client = new SmsGatewayClient({ baseUrl: defaultBaseUrl, apiKey: defaultApiKey });
    try {
      const res = await client.verifyOtp({ phone: opts.phone, code: opts.code });
      if (res.verified) {
        console.log(`✓ Verification successful! ${res.message}`);
      } else {
        console.log(`✗ Verification failed.`);
      }
    } catch (err: any) {
      console.error(`Error verifying OTP: ${err.message}`);
    }
  });

// Devices list
program
  .command('devices')
  .description('List paired Android SIM devices')
  .action(async () => {
    const client = new SmsGatewayClient({ baseUrl: defaultBaseUrl, apiKey: defaultApiKey });
    try {
      const res = await client.listDevices();
      console.log(`\nPaired Devices:`);
      if (res.devices.length === 0) {
        console.log('No devices paired yet.');
        return;
      }
      console.table(
        res.devices.map((d: any) => ({
          ID: d.id.slice(0, 8) + '...',
          Name: d.name,
          Status: d.status,
          Platform: d.platform,
          LastSeen: d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleTimeString() : 'Never',
        }))
      );
    } catch (err: any) {
      console.error(`Error listing devices: ${err.message}`);
    }
  });

// Stream SSE events
program
  .command('stream')
  .description('Stream real-time SMS Gateway events to stdout')
  .action(async () => {
    const streamUrl = `${defaultBaseUrl}/v1/events/stream?apiKey=${defaultApiKey}`;
    console.log(`Connecting to SSE stream at ${streamUrl} ...`);

    try {
      const response = await fetch(streamUrl);
      if (!response.ok || !response.body) {
        console.error(`Failed to connect to stream: HTTP ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        process.stdout.write(text);
      }
    } catch (err: any) {
      console.error(`Stream error: ${err.message}`);
    }
  });

// Device simulator command
program
  .command('simulate')
  .description('Run a virtual Android SIM handset simulator')
  .option('-s, --session <sessionId>', 'Pairing session ID')
  .option('-c, --code <code>', 'Pairing one-time code')
  .option('-t, --token <token>', 'Existing device token')
  .option('-d, --id <deviceId>', 'Existing device ID')
  .option('-n, --name <name>', 'Device Name', 'Virtual Android Handset')
  .action(async (opts) => {
    const { runDeviceSimulator } = await import('./device-simulator.js');
    await runDeviceSimulator({
      baseUrl: defaultBaseUrl,
      pairingSessionId: opts.session,
      pairingCode: opts.code,
      deviceToken: opts.token,
      deviceId: opts.id,
      deviceName: opts.name,
    });
  });

program.parse(process.argv);
