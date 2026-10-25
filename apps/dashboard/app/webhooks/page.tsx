'use client';

import React, { useState, useEffect } from 'react';
import { Webhook, Plus, Send, RefreshCw, Check, Copy } from 'lucide-react';

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('https://webhook.site/placeholder');
  const [newEndpointData, setNewEndpointData] = useState<any | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'bk_test_demo_secret_key_123456789';

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/webhooks`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json();
      setEndpoints(data.endpoints || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/v1/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ url: webhookUrl, eventTypes: ['*'] }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewEndpointData(data);
        fetchWebhooks();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert(`Error registering webhook: ${err.message}`);
    }
  };

  const handleTestPing = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/v1/webhooks/${id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json();
      setTestResult(data);
      fetchWebhooks();
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Signed Webhooks</h1>
          <p className="text-sm text-slate-400">
            Outbox event delivery with HMAC-SHA256 signatures (<code>X-SMSGW-Signature: v1=...</code>) and exponential backoff retry.
          </p>
        </div>

        <button
          onClick={fetchWebhooks}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors self-start"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {newEndpointData && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
          <div className="text-emerald-400 font-semibold text-sm">
            Webhook Endpoint Registered
          </div>
          <p className="text-xs text-slate-300">
            Copy your HMAC-SHA256 secret now. Use this to verify signatures in your receiving backend:
          </p>
          <div className="flex items-center space-x-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <code className="text-emerald-400 text-xs font-mono flex-1 break-all">
              {newEndpointData.secret}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newEndpointData.secret);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {testResult && (
        <div
          className={`p-3 rounded-xl border text-xs font-mono ${
            testResult.success
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}
        >
          {testResult.success
            ? `✓ Webhook ping delivered successfully! Status: ${testResult.statusCode}`
            : `✗ Webhook delivery failed: ${testResult.error || `HTTP ${testResult.statusCode}`}`}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Register Form */}
        <div className="lg:col-span-4 p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-700 pb-3">
            <Plus className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Register Endpoint</h2>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Target URL (HTTPS in production)
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-domain.com/webhooks"
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold rounded-lg text-sm transition-colors"
            >
              Add Webhook Destination
            </button>
          </form>
        </div>

        {/* Endpoints Table */}
        <div className="lg:col-span-8 bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase font-medium border-b border-slate-700/60">
              <tr>
                <th className="px-6 py-3.5">Endpoint URL</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Events</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40 text-slate-300 font-mono text-xs">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-sans">
                    Loading endpoints...
                  </td>
                </tr>
              ) : endpoints.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-sans">
                    No webhooks registered.
                  </td>
                </tr>
              ) : (
                endpoints.map((ep) => (
                  <tr key={ep.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-6 py-4 font-semibold text-white break-all max-w-xs">{ep.url}</td>
                    <td className="px-6 py-4 font-sans">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Enabled
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {ep.eventTypes.join(', ')}
                    </td>
                    <td className="px-6 py-4 text-right font-sans">
                      <button
                        onClick={() => handleTestPing(ep.id)}
                        disabled={testingId === ep.id}
                        className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white inline-flex items-center space-x-1 text-xs transition-colors"
                      >
                        <Send className="h-3 w-3" />
                        <span>{testingId === ep.id ? 'Sending...' : 'Test Ping'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
