'use client';

import React, { useState, useEffect } from 'react';
import { Radio, Upload, CheckCircle2, AlertTriangle, ShieldAlert, Play, RefreshCw } from 'lucide-react';

export default function BroadcastsPage() {
  const [broadcastName, setBroadcastName] = useState('Product Launch Notification');
  const [rawRecipients, setRawRecipients] = useState(
    '+919876543210\n+919876543211\n+919876543210\n9876543212\ninvalid-phone\n+919876543213'
  );
  const [template, setTemplate] = useState('Flash Sale Alert: Get 30% off today only at our store!');

  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'bk_test_demo_secret_key_123456789';

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/broadcasts`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json();
      setCampaigns(data.broadcasts || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleDryRunPreview = async () => {
    setLoadingPreview(true);
    setLaunchMsg(null);
    try {
      const list = rawRecipients
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`${API_BASE}/v1/broadcasts/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          recipients: list,
          bodyTemplate: template,
        }),
      });

      const data = await res.json();
      setPreviewResult(data);
    } catch (err: any) {
      alert(`Dry run failed: ${err.message}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleLaunchBroadcast = async () => {
    if (!previewResult || previewResult.summary.eligible === 0) {
      alert('Please run a preview dry-run with at least one eligible recipient first.');
      return;
    }

    setLaunching(true);
    setLaunchMsg(null);
    try {
      const list = rawRecipients
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`${API_BASE}/v1/broadcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          name: broadcastName,
          recipients: list,
          bodyTemplate: template,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setLaunchMsg(`✓ Campaign "${data.name}" queued with ${data.totalRecipients} recipients.`);
        fetchCampaigns();
      } else {
        setLaunchMsg(`✗ Failed to queue campaign: ${data.error}`);
      }
    } catch (err: any) {
      setLaunchMsg(`✗ Error: ${err.message}`);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Broadcast Campaigns</h1>
        <p className="text-sm text-slate-400">
          CSV batching with recipient deduplication, E.164 normalization, and strict pre-send opt-out suppression.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Form */}
        <div className="lg:col-span-6 p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-700 pb-3">
            <Radio className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">New Broadcast Job</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Campaign Name
              </label>
              <input
                type="text"
                value={broadcastName}
                onChange={(e) => setBroadcastName(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Recipients List (One Phone per line or CSV)
              </label>
              <textarea
                value={rawRecipients}
                onChange={(e) => setRawRecipients(e.target.value)}
                rows={6}
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                SMS Content Template
              </label>
              <textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={3}
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={handleDryRunPreview}
                disabled={loadingPreview}
                className="flex-1 py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg text-xs transition-colors flex items-center justify-center space-x-2"
              >
                <span>{loadingPreview ? 'Validating...' : 'Validate & Preview Dry-Run'}</span>
              </button>

              <button
                type="button"
                onClick={handleLaunchBroadcast}
                disabled={launching || !previewResult}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                <span>{launching ? 'Launching...' : 'Launch Broadcast'}</span>
              </button>
            </div>

            {launchMsg && (
              <div
                className={`p-3 rounded-lg text-xs font-mono ${
                  launchMsg.startsWith('✓')
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
              >
                {launchMsg}
              </div>
            )}
          </div>
        </div>

        {/* Validation Dry-Run Summary */}
        <div className="lg:col-span-6 p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-700 pb-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Pre-Flight Validation Dry-Run</h2>
          </div>

          {!previewResult ? (
            <div className="py-20 text-center text-slate-500 text-xs">
              Click "Validate & Preview Dry-Run" to scan rows for duplicates, opt-outs, and malformed E.164 numbers.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase">Total Rows</div>
                  <div className="text-lg font-bold text-white mt-1">{previewResult.summary.totalRows}</div>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <div className="text-emerald-400 text-[10px] uppercase">Eligible</div>
                  <div className="text-lg font-bold text-emerald-300 mt-1">{previewResult.summary.eligible}</div>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <div className="text-amber-400 text-[10px] uppercase">Duplicates</div>
                  <div className="text-lg font-bold text-amber-300 mt-1">{previewResult.summary.duplicates}</div>
                </div>
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <div className="text-red-400 text-[10px] uppercase">Opted-Out</div>
                  <div className="text-lg font-bold text-red-300 mt-1">{previewResult.summary.optedOut}</div>
                </div>
              </div>

              {previewResult.issues?.invalid?.length > 0 && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs space-y-1">
                  <div className="font-semibold text-red-400 flex items-center space-x-1">
                    <ShieldAlert className="h-4 w-4" />
                    <span>Malformed Phone Numbers Rejected:</span>
                  </div>
                  {previewResult.issues.invalid.map((item: any, i: number) => (
                    <div key={i} className="text-slate-300 font-mono text-[11px]">
                      • "{item.input}": {item.reason}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-slate-400 mb-2">Sample Eligible Recipients (Redacted):</h4>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1 font-mono text-xs text-emerald-400">
                  {previewResult.previewSample?.map((item: any, i: number) => (
                    <div key={i}>✓ {item.redacted}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
