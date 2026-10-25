import { SmsGatewayClient } from '@sms-gateway/api-client';

export async function runDeviceSimulator(options: {
  baseUrl: string;
  pairingSessionId?: string;
  pairingCode?: string;
  deviceToken?: string;
  deviceId?: string;
  deviceName?: string;
}) {
  const { baseUrl, deviceName = 'Virtual Android Pixel 8' } = options;
  let deviceId = options.deviceId;
  let deviceToken = options.deviceToken;

  console.log(`\n===========================================`);
  console.log(`  📱 Virtual Android SIM Device Simulator`);
  console.log(`===========================================`);
  console.log(`API Target: ${baseUrl}`);

  const client = new SmsGatewayClient({ baseUrl });

  // If pairing parameters provided, pair now
  if (options.pairingSessionId && options.pairingCode) {
    console.log(`\n[Pairing] Exchanging pairing code with API...`);
    try {
      const pairRes = await client.pairDevice({
        pairingSessionId: options.pairingSessionId,
        code: options.pairingCode,
        deviceName,
        platform: 'simulator',
        capabilities: {
          model: 'Pixel 8',
          androidVersion: '14',
          simSlots: 1,
          simCarrier: 'Airtel India (Simulated)',
        },
      });

      deviceId = pairRes.deviceId;
      deviceToken = pairRes.deviceToken;
      console.log(`✓ Device Paired Successfully!`);
      console.log(`  Device ID:    ${deviceId}`);
      console.log(`  Device Token: ${deviceToken.slice(0, 15)}...`);
    } catch (err: any) {
      console.error(`✗ Pairing failed: ${err.message}`);
      return;
    }
  }

  if (!deviceId || !deviceToken) {
    console.error(`Error: Device must be paired first. Provide pairingSessionId and pairingCode.`);
    return;
  }

  const authenticatedDeviceClient = new SmsGatewayClient({
    baseUrl,
    deviceToken,
  });

  console.log(`\n[Status] Device online. Starting heartbeat & job polling loop...`);

  // Heartbeat loop (every 20s)
  setInterval(async () => {
    try {
      await authenticatedDeviceClient.deviceHeartbeat(deviceId!, {
        battery: 92,
        isCharging: true,
        networkType: '5G_SA',
        simOperator: 'Airtel 5G',
      });
    } catch (err: any) {
      console.error(`[Heartbeat Error]: ${err.message}`);
    }
  }, 20000);

  // Initial heartbeat
  await authenticatedDeviceClient.deviceHeartbeat(deviceId, {
    battery: 95,
    isCharging: true,
    networkType: '5G_SA',
    simOperator: 'Airtel 5G',
  });

  // Polling loop (every 3s)
  setInterval(async () => {
    try {
      const { jobs } = await authenticatedDeviceClient.getDeviceJobs(deviceId!);
      if (jobs && jobs.length > 0) {
        for (const job of jobs) {
          console.log(`\n-------------------------------------------`);
          console.log(`📨 [SIM Send Job Claimed] Job ID: ${job.id}`);
          console.log(`   Recipient: ${job.to}`);
          console.log(`   Body:      "${job.body}"`);
          console.log(`   Simulating radio transmit via SIM...`);

          // Simulate Android radio delay 600ms
          await new Promise((r) => setTimeout(r, 600));

          // Report sent result
          await authenticatedDeviceClient.reportJobResult(job.id, {
            status: 'sent',
            carrierMessageId: `sim_carrier_${Math.floor(Math.random() * 1000000)}`,
          });
          console.log(`✓ [SIM Delivered] Result reported back to gateway.`);
          console.log(`-------------------------------------------\n`);
        }
      }
    } catch (err: any) {
      // Ignore polling connection blips
    }
  }, 3000);
}
