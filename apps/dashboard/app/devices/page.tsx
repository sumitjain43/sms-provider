'use client';

import React, { useEffect, useState } from 'react';
import { Smartphone, QrCode, Battery, RefreshCw, X, AlertTriangle, ShieldCheck } from 'lucide-react';

interface DeviceItem {
  id: string;
  name: string;
  platform: string;
  status: 'online' | 'offline';
  lastSeenAt?: string;
  capabilities?: {
    battery?: number;
    simOperator?: string;
    model?: string;
  };
  createdAt: string;
}

interface PairingSessionData {
  pairingSessionId: string;
  code: string;
  qrDataUrl: string;
  expiresAt: string;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairingData, setPairingData] = useState<PairingSessionData | null>(null);
  const [generatingSession, setGeneratingSession] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'bk_test_demo_secret_key_123456789';

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/devices`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json();
      setDevices(data.devices || []);
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleStartPairing = async () => {
    setGeneratingSession(true);
    setShowPairModal(true);
    try {
      const res = await fetch(`${API_BASE}/v1/devices/pairing-sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json();
      setPairingData(data);
    } catch (err) {
      console.error('Failed to generate pairing session:', err);
    } finally {
      setGeneratingSession(false);
    }
  };

  const handleUnpair = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this device? It will be disconnected immediately.')) {
      return;
    }
    try {
      await fetch(`${API_BASE}/v1/devices/${id}/unpair`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      fetchDevices();
    } catch (err) {
      console.error('Failed to unpair device:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Android SIM Handsets</h1>
          <p className="text-sm text-slate-400">
            Connect physical Android smartphones to route outbound SMS traffic directly through cellular SIM cards.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchDevices}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={handleStartPairing}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold rounded-lg text-sm flex items-center space-x-2 transition-colors shadow-lg shadow-emerald-950/30"
          >
            <QrCode className="h-4 w-4" />
            <span>Pair Android Handset</span>
          </button>
        </div>
      </div>

      {/* Handset Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-500">
            Scanning for connected devices...
          </div>
        ) : devices.length === 0 ? (
          <div className="col-span-full p-12 bg-slate-800/40 border border-slate-700/60 rounded-xl text-center space-y-4">
            <Smartphone className="h-12 w-12 text-slate-600 mx-auto" />
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-semibold text-white">No Handsets Paired</h3>
              <p className="text-xs text-slate-400">
                You can pair an Android phone running our Gateway APK or launch the CLI virtual simulator. Messages will automatically route in simulated mode if no phone is online.
              </p>
            </div>
            <button
              onClick={handleStartPairing}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-medium text-xs rounded-lg transition-colors"
            >
              Generate Pairing QR Code
            </button>
          </div>
        ) : (
          devices.map((device) => (
            <div
              key={device.id}
              className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="font-semibold text-white text-base">{device.name}</h3>
                  <span className="text-xs font-mono text-slate-400">
                    ID: {device.id.slice(0, 8)}...
                  </span>
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
                    device.status === 'online'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                      device.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                    }`}
                  />
                  {device.status}
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Platform:</span>
                  <span className="capitalize">{device.platform}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Carrier / SIM:</span>
                  <span>{device.capabilities?.simOperator || 'Physical SIM 1'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Battery Level:</span>
                  <span className="flex items-center space-x-1">
                    <Battery className="h-3.5 w-3.5 text-emerald-400" />
                    <span>{device.capabilities?.battery ?? 100}%</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Last Heartbeat:</span>
                  <span>
                    {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleTimeString() : 'Never'}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => handleUnpair(device.id)}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium transition-colors"
                >
                  Revoke & Unpair
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* QR Code Pairing Modal */}
      {showPairModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <QrCode className="h-5 w-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Device Pairing Protocol</h3>
              </div>
              <button
                onClick={() => {
                  setShowPairModal(false);
                  fetchDevices();
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {generatingSession ? (
              <div className="py-12 text-center text-slate-400">
                Generating 128-bit cryptographic pairing payload...
              </div>
            ) : pairingData ? (
              <div className="space-y-4 text-center">
                <p className="text-xs text-slate-400">
                  Scan this QR code with the Android Gateway App, or enter the details manually.
                </p>

                <div className="p-4 bg-white rounded-xl inline-block shadow-inner mx-auto">
                  <img
                    src={pairingData.qrDataUrl}
                    alt="Device Pairing QR Code"
                    className="w-48 h-48 mx-auto"
                  />
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-left space-y-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Session ID</span>
                    <span className="font-mono text-slate-200 select-all">{pairingData.pairingSessionId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">One-Time Pairing Code</span>
                    <span className="font-mono text-emerald-400 font-bold text-sm select-all">{pairingData.code}</span>
                  </div>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-left text-xs text-amber-300 flex items-start space-x-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Expires in 10 minutes. For testing right now, open a terminal in the project folder and run:
                    <code className="block mt-1 font-mono text-[11px] bg-slate-900 p-1.5 rounded text-slate-300">
                      cd Desktop\SMS-Provide ; npm run simulate -- -s {pairingData.pairingSessionId} -c {pairingData.code}
                    </code>
                  </span>
                </div>
              </div>
            ) : null}

            <button
              onClick={() => {
                setShowPairModal(false);
                fetchDevices();
              }}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
            >
              Done & Check Device Status
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
