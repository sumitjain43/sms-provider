'use client';

import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Smartphone,
  ShieldCheck,
  Send,
  Zap,
  Activity,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface Stats {
  totalMessages: number;
  activeDevices: number;
  optOuts: number;
  uptime: number;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats>({
    totalMessages: 0,
    activeDevices: 0,
    optOuts: 0,
    uptime: 0,
  });
  const [events, setEvents] = useState<Array<{ id: string; type: string; time: string; text: string }>>([]);
  const [quickPhone, setQuickPhone] = useState('+919876543210');
  const [quickBody, setQuickBody] = useState('Hello! Your order #1042 has shipped.');
  const [isSending, setIsSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'bk_test_demo_secret_key_123456789';

  useEffect(() => {
    // Initial fetch of messages and devices
    const fetchData = async () => {
      try {
        const [msgRes, devRes, optRes, healthRes] = await Promise.all([
          fetch(`${API_BASE}/v1/messages?limit=1`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
          fetch(`${API_BASE}/v1/devices`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
          fetch(`${API_BASE}/v1/opt-outs`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
          fetch(`${API_BASE}/health`).then((r) => r.json()),
        ]);

        setStats({
          totalMessages: msgRes.pagination?.total ?? 0,
          activeDevices: devRes.devices?.filter((d: any) => d.status === 'online').length ?? 0,
          optOuts: optRes.optOuts?.length ?? 0,
          uptime: Math.floor(healthRes.uptime ?? 0),
        });
      } catch (err) {
        console.error('Error fetching stats:', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 8000);

    // Connect to SSE live stream
    const eventSource = new EventSource(`${API_BASE}/v1/events/stream?apiKey=${API_KEY}`);
    eventSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        setEvents((prev) => [
          {
            id: parsed.id || String(Date.now()),
            type: parsed.type || 'event',
            time: new Date().toLocaleTimeString(),
            text: JSON.stringify(parsed.payload || {}),
          },
          ...prev.slice(0, 19),
        ]);
      } catch {}
    };

    return () => {
      clearInterval(interval);
      eventSource.close();
    };
  }, [API_BASE, API_KEY]);

  const handleSendQuickSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setSendFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
          'Idempotency-Key': `dash_${Date.now()}`,
        },
        body: JSON.stringify({ to: quickPhone, body: quickBody }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendFeedback(`✓ Queued successfully! Message ID: ${data.id.slice(0, 8)}... (${data.status})`);
      } else {
        setSendFeedback(`✗ Error: ${data.error}`);
      }
    } catch (err: any) {
      setSendFeedback(`✗ Failed to connect: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Gateway Overview</h1>
          <p className="text-sm text-slate-400">
            Real-time status of your self-hosted SMS Gateway, devices, and traffic.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-ping" />
            Live SSE Connected
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center space-x-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Messages</p>
            <p className="text-2xl font-bold text-white mt-0.5">{stats.totalMessages}</p>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center space-x-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
            <Smartphone className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Handsets</p>
            <p className="text-2xl font-bold text-white mt-0.5">{stats.activeDevices}</p>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center space-x-4">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Opt-Out Suppressed</p>
            <p className="text-2xl font-bold text-white mt-0.5">{stats.optOuts}</p>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center space-x-4">
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-lg">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Uptime</p>
            <p className="text-2xl font-bold text-white mt-0.5">{stats.uptime}s</p>
          </div>
        </div>
      </div>

      {/* Main Content Split: Quick Send & Live Event Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Quick Send Sandbox Form */}
        <div className="lg:col-span-5 p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-700 pb-3">
            <Send className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Send Test SMS</h2>
          </div>
          <form onSubmit={handleSendQuickSms} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Recipient (E.164 Format)
              </label>
              <input
                type="text"
                value={quickPhone}
                onChange={(e) => setQuickPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                SMS Content Body
              </label>
              <textarea
                value={quickBody}
                onChange={(e) => setQuickBody(e.target.value)}
                rows={3}
                placeholder="Enter SMS message text..."
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                required
              />
              <span className="text-[11px] text-slate-400">
                {quickBody.length} chars (1 GSM SMS part)
              </span>
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold rounded-lg text-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>{isSending ? 'Dispatching...' : 'Dispatch Message'}</span>
            </button>
          </form>

          {sendFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-mono ${
                sendFeedback.startsWith('✓')
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {sendFeedback}
            </div>
          )}
        </div>

        {/* Live SSE Activity Stream */}
        <div className="lg:col-span-7 p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4 flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-emerald-400" />
              <h2 className="text-base font-semibold text-white">Live Event Stream (SSE)</h2>
            </div>
            <span className="text-xs font-mono text-slate-400">/v1/events/stream</span>
          </div>

          <div className="flex-1 bg-slate-950 rounded-lg p-3 overflow-y-auto max-h-[340px] font-mono text-xs space-y-2 border border-slate-800">
            {events.length === 0 ? (
              <div className="text-slate-500 text-center py-12">
                Listening for gateway events... Send a message or trigger OTP to view live trace.
              </div>
            ) : (
              events.map((evt) => (
                <div key={evt.id} className="p-2 rounded bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                      {evt.type}
                    </span>
                    <span className="text-slate-500">{evt.time}</span>
                  </div>
                  <div className="text-slate-400 break-all text-[11px]">{evt.text}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
