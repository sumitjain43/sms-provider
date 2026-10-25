'use client';

import React, { useState, useEffect } from 'react';
import { ShieldBan, Plus, Trash2, RefreshCw } from 'lucide-react';

export default function OptOutsPage() {
  const [optOuts, setOptOuts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState('');
  const [source, setSource] = useState('DASHBOARD');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'bk_test_demo_secret_key_123456789';

  const fetchOptOuts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/opt-outs`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json();
      setOptOuts(data.optOuts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOptOuts();
  }, []);

  const handleAddOptOut = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/v1/opt-outs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ phone: newPhone, source }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback(`✓ Opt-out registered for ${data.phone}`);
        setNewPhone('');
        fetchOptOuts();
      } else {
        setActionFeedback(`✗ Error: ${data.error}`);
      }
    } catch (err: any) {
      setActionFeedback(`✗ Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Opt-Out Suppression Registry</h1>
          <p className="text-sm text-slate-400">
            Strict compliance registry. Numbers registered here are automatically blocked prior to queueing and sending.
          </p>
        </div>

        <button
          onClick={fetchOptOuts}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors self-start"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Register Opt-out Form */}
        <div className="lg:col-span-4 p-6 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-700 pb-3">
            <Plus className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Add Opt-Out Number</h2>
          </div>

          <form onSubmit={handleAddOptOut} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Phone Number (E.164)
              </label>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="DASHBOARD">Manual Dashboard Entry</option>
                <option value="SMS_STOP">Inbound "STOP" SMS</option>
                <option value="API">API Suppression Webhook</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold rounded-lg text-sm transition-colors"
            >
              Add to Suppression Registry
            </button>
          </form>

          {actionFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-mono ${
                actionFeedback.startsWith('✓')
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {actionFeedback}
            </div>
          )}
        </div>

        {/* Opt-out Records Table */}
        <div className="lg:col-span-8 bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase font-medium border-b border-slate-700/60">
              <tr>
                <th className="px-6 py-3.5">Suppressed Phone</th>
                <th className="px-6 py-3.5">Source</th>
                <th className="px-6 py-3.5">Registered At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40 text-slate-300 font-mono text-xs">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-slate-500 font-sans">
                    Loading records...
                  </td>
                </tr>
              ) : optOuts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-slate-500 font-sans">
                    No opted-out numbers registered.
                  </td>
                </tr>
              ) : (
                optOuts.map((opt) => (
                  <tr key={opt.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-6 py-4 font-semibold text-red-400">{opt.phoneRedacted}</td>
                    <td className="px-6 py-4 text-slate-300 font-sans text-xs">{opt.source}</td>
                    <td className="px-6 py-4 text-slate-400 font-sans text-xs">
                      {new Date(opt.createdAt).toLocaleString()}
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
